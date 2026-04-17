from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import osmnx as ox
import networkx as nx
import warnings

warnings.filterwarnings('ignore')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

G = None
landmarks = {}

@app.on_event("startup")
def load_data():
    global G, landmarks
    print("🔄 Loading Map...")
    G = ox.load_graphml("iitk_campus_walk.graphml")
    
    # Minimal POI loading to ensure speed
    iitk_coords = (26.5123, 80.2329)
    pois = ox.features_from_point(iitk_coords, dist=1500, tags={'building': True})
    named_pois = pois.dropna(subset=['name'])
    for _, row in named_pois.iterrows():
        c = row['geometry'].centroid 
        landmarks[str(row['name'])] = {"lat": c.y, "lng": c.x}
    print("✅ Debug Backend Ready!")

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    mode: str = "walk"

@app.get("/api/landmarks")
def get_landmarks():
    return dict(sorted(landmarks.items()))

@app.post("/api/route")
def calculate_route(req: RouteRequest):
    # Fixed Speed Logic
    speed_kmh = 5.0 if req.mode == "walk" else 15.0 if req.mode == "cycle" else 25.0
    
    try:
        # --- THE DEBUG FIX ---
        # We pass coordinates directly as (G, X, Y)
        # In OSMnx, X is Longitude and Y is Latitude.
        orig_node = ox.nearest_nodes(G, req.start_lng, req.start_lat)
        dest_node = ox.nearest_nodes(G, req.end_lng, req.end_lat)
        
        # Simple shortest path (Streamlit style)
        route = nx.shortest_path(G, orig_node, dest_node, weight='length')
        
        # Calculate stats
        distance_m = nx.path_weight(G, route, weight='length')
        time_min = (distance_m / 1000 / speed_kmh) * 60
        
        # Convert nodes to [lat, lng] for Leaflet
        path_coords = [[G.nodes[n]['y'], G.nodes[n]['x']] for n in route]
        
        # We return a list with ONE route so the frontend still works
        return [{
            "id": 0,
            "distance_meters": round(distance_m, 1),
            "time_minutes": round(time_min, 1),
            "path": path_coords
        }]
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))