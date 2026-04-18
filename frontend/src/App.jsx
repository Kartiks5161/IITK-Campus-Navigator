import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { Navigation, RefreshCcw, Bike, Footprints, Car, Search, Clock, Ruler, X, LocateFixed, ListOrdered, ArrowRight, ArrowUp, CornerUpLeft, CornerUpRight, Coffee, Banknote, Stethoscope } from 'lucide-react';

const API_BASE = "http://localhost:8000";

// --- CUSTOM ICONS ---
const createIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const startIcon = createIcon('green');
const endIcon = createIcon('red');
const userIcon = createIcon('blue');
const exploreIcon = createIcon('gold'); // Special icon for explored amenities

const getTurnIcon = (instruction) => {
  const lower = instruction.toLowerCase();
  if (lower.includes("left")) return <CornerUpLeft size={16} />;
  if (lower.includes("right")) return <CornerUpRight size={16} />;
  if (lower.includes("straight") || lower.includes("head") || lower.includes("continue")) return <ArrowUp size={16} />;
  return <ArrowRight size={16} />;
};

const SearchableSelect = ({ label, options, selectedName, onSelect, placeholder, onClear }) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { setQuery(selectedName || ""); }, [selectedName]);

  const filtered = Object.keys(options).filter(name => 
    name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  return (
    <div style={{ marginBottom: '15px', position: 'relative' }}>
      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input 
          type="text" placeholder={placeholder} value={query}
          onFocus={() => setIsOpen(true)} onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          style={{ width: '100%', padding: '12px 35px 12px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
        />
        {query && <X size={14} onClick={onClear} style={{ position: 'absolute', right: '12px', top: '14px', color: '#cbd5e1', cursor: 'pointer' }} />}
      </div>
      {isOpen && query && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', marginTop: '5px', zIndex: 100, boxShadow: '0 10px 15px rgba(0,0,0,0.1)' }}>
          {filtered.map(name => (
            <div key={name} onClick={() => { onSelect(options[name], name); setIsOpen(false); }} style={{ padding: '12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }}>
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function ChangeView({ bounds }) {
  const map = useMap();
  if (bounds && bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
  return null;
}

const getNearestName = (latlng, landmarks) => {
  let nearest = "Custom Point";
  let minD = Infinity;
  Object.entries(landmarks).forEach(([name, coords]) => {
    const d = Math.pow(coords.lat - latlng.lat, 2) + Math.pow(coords.lng - latlng.lng, 2);
    if (d < minD) { minD = d; nearest = `Near ${name}`; }
  });
  return minD < 0.00002 ? nearest : "Custom Point";
};

function App() {
  const [landmarks, setLandmarks] = useState({});
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [startName, setStartName] = useState("");
  const [endName, setEndName] = useState("");
  const [userLoc, setUserLoc] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [mode, setMode] = useState('walk');
  
  // --- NEW: Explore States ---
  const [exploreData, setExploreData] = useState({});
  const [activeCategory, setActiveCategory] = useState("");

  useEffect(() => {
    axios.get(`${API_BASE}/api/landmarks`).then(res => setLandmarks(res.data));
  }, []);

  const fetchRoutes = async (s, e, m) => {
    if (!s || !e) return;
    try {
      const res = await axios.post(`${API_BASE}/api/route`, {
        start_lat: s.lat, start_lng: s.lng, end_lat: e.lat, end_lng: e.lng, mode: m
      });
      setRoutes(res.data);
    } catch (err) { 
      alert(err.response?.data?.detail || `Cannot find a valid ${m} path here. Try a different point!`);
      setRoutes([]); 
    }
  };

  useEffect(() => { if(start && end) fetchRoutes(start, end, mode); }, [mode, start, end]);

  // --- NEW: Fetch Explore Category ---
  const handleExplore = async (category) => {
    // If clicking the same button, turn it off
    if (activeCategory === category) {
      setActiveCategory("");
      setExploreData({});
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/explore/${category}`);
      setExploreData(res.data);
      setActiveCategory(category);
    } catch (err) { console.error("Could not load amenities"); }
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        if (!start) { setStart(e.latlng); setStartName(getNearestName(e.latlng, landmarks)); }
        else if (!end) { setEnd(e.latlng); setEndName(getNearestName(e.latlng, landmarks)); }
      },
    });
    return null;
  };

  const locateUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(coords); setStart(coords); setStartName("My Current Location");
      }, () => alert("Location access denied or failed. Please check browser settings."));
    } else alert("Geolocation is not supported by this browser.");
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'sans-serif', backgroundColor: '#f8fafc' }}>
      
      <aside style={{ width: '400px', backgroundColor: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        
        <div style={{ padding: '24px', backgroundColor: '#0f172a', color: 'white' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>IITK Navigator Pro</h1>
          <p style={{ margin: 0, fontSize: '10px', opacity: 0.6, letterSpacing: '1px' }}>TURN-BY-TURN DIRECTIONS</p>
        </div>

        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          
          {/* --- NEW: EXPLORE CHIPS (Like Google Maps) --- */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
             <button onClick={() => handleExplore('food')} style={{ padding: '8px 12px', borderRadius: '20px', border: activeCategory === 'food' ? '2px solid #eab308' : '1px solid #e2e8f0', backgroundColor: activeCategory === 'food' ? '#fef9c3' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}>
               <Coffee size={14} color={activeCategory === 'food' ? '#ca8a04' : '#64748b'} /> Food & Cafe
             </button>
             <button onClick={() => handleExplore('money')} style={{ padding: '8px 12px', borderRadius: '20px', border: activeCategory === 'money' ? '2px solid #eab308' : '1px solid #e2e8f0', backgroundColor: activeCategory === 'money' ? '#fef9c3' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}>
               <Banknote size={14} color={activeCategory === 'money' ? '#ca8a04' : '#64748b'} /> ATMs
             </button>
             <button onClick={() => handleExplore('health')} style={{ padding: '8px 12px', borderRadius: '20px', border: activeCategory === 'health' ? '2px solid #eab308' : '1px solid #e2e8f0', backgroundColor: activeCategory === 'health' ? '#fef9c3' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}>
               <Stethoscope size={14} color={activeCategory === 'health' ? '#ca8a04' : '#64748b'} /> Health
             </button>
          </div>

          <button onClick={locateUser} style={{ width: '100%', padding: '10px', marginBottom: '15px', backgroundColor: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <LocateFixed size={16} /> Use My Live Location
          </button>

          <SearchableSelect label="STARTING POINT" options={landmarks} selectedName={startName} placeholder="Search or click map..." onSelect={(c, n) => { setStart(c); setStartName(n); }} onClear={() => { setStart(null); setStartName(""); setRoutes([]); }} />
          <SearchableSelect label="DESTINATION" options={landmarks} selectedName={endName} placeholder="Search or click map..." onSelect={(c, n) => { setEnd(c); setEndName(n); }} onClear={() => { setEnd(null); setEndName(""); setRoutes([]); }} />

          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '10px' }}>TRAVEL MODE</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '25px' }}>
            {['walk', 'cycle', 'drive'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: '12px', borderRadius: '10px', border: mode === m ? '2px solid #2563eb' : '1px solid #e2e8f0', backgroundColor: mode === m ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                {m === 'walk' ? <Footprints size={18}/> : m === 'cycle' ? <Bike size={18}/> : <Car size={18}/>}
                <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '4px' }}>{m.toUpperCase()}</div>
              </button>
            ))}
          </div>

          {routes.length > 0 && (
            <>
              <div style={{ backgroundColor: '#2563eb', color: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Ruler size={20} />
                    <div>
                      <div style={{ fontSize: '10px', opacity: 0.7 }}>DISTANCE</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{(routes[0].distance_meters / 1000).toFixed(2)} km</div>
                    </div>
                  </div>
                  <div style={{ width: '1px', height: '30px', backgroundColor: 'rgba(255,255,255,0.2)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={20} />
                    <div>
                      <div style={{ fontSize: '10px', opacity: 0.7 }}>EST. TIME</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{Math.ceil(routes[0].time_minutes)} min</div>
                    </div>
                  </div>
                </div>
              </div>

              {routes[0].steps && routes[0].steps.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', marginBottom: '10px', fontWeight: 'bold', fontSize: '12px', letterSpacing: '0.5px' }}>
                    <ListOrdered size={16} /> ROUTE INSTRUCTIONS
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: 'white', overflow: 'hidden' }}>
                    {routes[0].steps.map((step, index) => (
                      <div key={index} style={{ padding: '12px 16px', borderBottom: index < routes[0].steps.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ backgroundColor: '#eff6ff', padding: '6px', borderRadius: '50%', color: '#2563eb' }}>
                          {getTurnIcon(step.instruction)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{step.instruction}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>for {step.distance} meters</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={() => { setStart(null); setEnd(null); setStartName(""); setEndName(""); setRoutes([]); setUserLoc(null); setExploreData({}); setActiveCategory(""); }} style={{ width: '100%', padding: '14px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 'bold', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <RefreshCcw size={16} /> Reset All
          </button>
        </div>
      </aside>

      <main style={{ flex: 1 }}>
        <MapContainer center={[26.5123, 80.2329]} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapClickHandler />
          
          {userLoc && <Marker position={userLoc} icon={userIcon}><Tooltip permanent direction="top">You are here</Tooltip></Marker>}
          
          {/* --- NEW: EXPLORE MARKERS --- */}
          {Object.entries(exploreData).map(([name, coords]) => (
            <Marker 
              key={name} 
              position={coords} 
              icon={exploreIcon}
              eventHandlers={{
                click: () => {
                  // Automatically set this amenity as the destination when clicked
                  setEnd(coords);
                  setEndName(name);
                }
              }}
            >
              <Tooltip direction="top" offset={[0, -30]} className="font-bold">{name}</Tooltip>
            </Marker>
          ))}

          {start && <Marker position={start} icon={startIcon}><Tooltip permanent direction="top" className="font-bold">{startName}</Tooltip></Marker>}
          {end && <Marker position={end} icon={endIcon}><Tooltip permanent direction="top" className="font-bold">{endName}</Tooltip></Marker>}
          
          {routes[0] && <Polyline positions={routes[0].path} color="#2563eb" weight={6} />}
          {routes[0] && mode !== 'walk' && end && <Polyline positions={[routes[0].path[routes[0].path.length - 1], end]} color="#94a3b8" weight={4} dashArray="8, 8" />}
          
          {routes.length > 0 && <ChangeView bounds={routes[0].path} />}
        </MapContainer>
      </main>
    </div>
  );
}

export default App;