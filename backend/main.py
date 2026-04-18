from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import osmnx as ox
import networkx as nx
import warnings
import math
import traceback # Added for detailed error logs

warnings.filterwarnings('ignore')

app = FastAPI(title="IITK Smart Nav API - Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

graphs = {}
landmarks = {}
explore_data = {
    "food": {},     # Cafes, restaurants, food courts
    "money": {},    # ATMs, banks
    "health": {}    # Clinics, pharmacies
}

def get_bearing(lat1, lon1, lat2, lon2):
    dLon = math.radians(lon2 - lon1)
    y = math.sin(dLon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - \
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dLon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def get_turn_direction(bearing1, bearing2):
    angle = (bearing2 - bearing1 + 360) % 360
    if 45 <= angle <= 135: return "Turn right"
    elif 135 < angle < 225: return "Make a U-turn"
    elif 225 <= angle <= 315: return "Turn left"
    else: return "Continue straight"

@app.on_event("startup")
def load_data():
    global graphs, landmarks, explore_data
    print("🚀 Initializing IITK Routing Engine...")
    try:
        graphs['walk'] = ox.load_graphml("iitk_walk.graphml")
        graphs['drive'] = ox.load_graphml("iitk_drive.graphml")
        
        iitk_coords = (26.5123, 80.2329)
        tags = {'amenity': True, 'building': True, 'leisure': True, 'office': True}
        
        pois = ox.features_from_point(iitk_coords, dist=1500, tags=tags)
        named_pois = pois.dropna(subset=['name'])
        
        for index, row in named_pois.iterrows():
            centroid = row['geometry'].centroid 
            name = str(row['name'])
            coords = {"lat": centroid.y, "lng": centroid.x}
            
            # Save to general landmarks for searching
            landmarks[name] = coords
            
            # Categorize the data for the "Explore" buttons
            amenity_type = str(row.get('amenity', '')).lower()
            if amenity_type in ['cafe', 'restaurant', 'fast_food', 'food_court']:
                explore_data["food"][name] = coords
            elif amenity_type in ['atm', 'bank']:
                explore_data["money"][name] = coords
            elif amenity_type in ['clinic', 'hospital', 'pharmacy']:
                explore_data["health"][name] = coords
                
        print("✅ Backend is ready to serve multi-modal routes and categories!")
    except Exception as e:
        print(f"❌ Error during startup: {e}")

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    mode: str = "walk"

@app.get("/api/landmarks")
def get_landmarks():
    return dict(sorted(landmarks.items()))

@app.get("/api/explore/{category}")
def explore_category(category: str):
    """Returns POIs for a specific category (food, money, health)."""
    if category in explore_data:
        return explore_data[category]
    return {}

@app.post("/api/route")
def calculate_route(req: RouteRequest):
    speeds = {"walk": 5.0, "cycle": 15.0, "drive": 25.0}
    mode = req.mode.lower()
    speed_kmh = speeds.get(mode, 5.0)
    
    active_graph = graphs['drive'] if mode == 'drive' else graphs['walk']
    
    try:
        start_node = ox.nearest_nodes(active_graph, req.start_lng, req.start_lat)
        end_node = ox.nearest_nodes(active_graph, req.end_lng, req.end_lat)
        
        if start_node == end_node: return []

        route = nx.shortest_path(active_graph, start_node, end_node, weight='length')
        distance_m = nx.path_weight(active_graph, route, weight='length')
        time_min = (distance_m / 1000) / speed_kmh * 60
        path_coords = [[active_graph.nodes[n]['y'], active_graph.nodes[n]['x']] for n in route]
        
        steps = []
        current_street = None
        current_length = 0
        last_bearing = None
        current_instruction = ""
        
        for i in range(len(route) - 1):
            u = route[i]
            v = route[i+1]
            
            # --- THE BUG FIX ---
            # Instead of assuming the edge ID is 0, we dynamically pick the shortest edge
            edge_dict = active_graph.get_edge_data(u, v)
            edge_data = min(edge_dict.values(), key=lambda x: x.get('length', float('inf')))
            # -------------------
            
            street_name = edge_data.get('name', 'Unnamed Path')
            if isinstance(street_name, list): street_name = street_name[0]
            segment_length = edge_data.get('length', 0)
            
            lat1, lon1 = active_graph.nodes[u]['y'], active_graph.nodes[u]['x']
            lat2, lon2 = active_graph.nodes[v]['y'], active_graph.nodes[v]['x']
            current_bearing = get_bearing(lat1, lon1, lat2, lon2)
            
            if street_name == current_street:
                current_length += segment_length
            else:
                if current_street is not None:
                    steps.append({"instruction": current_instruction, "distance": round(current_length)})
                    turn = get_turn_direction(last_bearing, current_bearing)
                    current_instruction = f"Continue onto {street_name}" if turn == "Continue straight" else f"{turn} onto {street_name}"
                else:
                    current_instruction = f"Head along {street_name}"
                current_street = street_name
                current_length = segment_length
            last_bearing = current_bearing 
            
        if current_street is not None:
             steps.append({"instruction": current_instruction, "distance": round(current_length)})

        return [{
            "id": 0, "distance_meters": round(distance_m, 1), 
            "time_minutes": round(time_min, 1), "path": path_coords, "steps": steps
        }]
        
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail=f"No {mode} route found. These points might be disconnected.")
    except Exception as e:
        traceback.print_exc() # Prints the exact line of failure to the server console
        raise HTTPException(status_code=500, detail=f"System Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")