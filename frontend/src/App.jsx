import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { Navigation, RefreshCcw, Bike, Footprints, Car, Search, Clock, Ruler, X, LocateFixed, ListOrdered, ArrowRight, ArrowUp, CornerUpLeft, CornerUpRight, Coffee, Banknote, Stethoscope, ChevronLeft, ChevronRight, Play, Pause, Square, Plus, Trash2, AlertTriangle } from 'lucide-react'; 

const API_BASE = "https://iitk-navigator-api.onrender.com";

const createIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const startIcon = createIcon('green');
const endIcon = createIcon('red');
const waypointIcon = createIcon('orange'); 
const userIcon = createIcon('blue');
const exploreIcon = createIcon('gold'); 

const MAP_THEMES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
};

const getTurnIcon = (instruction) => {
  if (instruction.includes("📍")) return <Navigation size={16} />;
  const lower = instruction.toLowerCase();
  if (lower.includes("left")) return <CornerUpLeft size={16} />;
  if (lower.includes("right")) return <CornerUpRight size={16} />;
  if (lower.includes("straight") || lower.includes("head") || lower.includes("continue")) return <ArrowUp size={16} />;
  return <ArrowRight size={16} />;
};

const getDistanceMeters = (p1, p2) => {
  if (!p1 || !p2) return 0;
  const R = 6371e3; 
  const lat1 = p1.lat * Math.PI/180; 
  const lat2 = p2.lat * Math.PI/180;
  const dLat = (p2.lat-p1.lat) * Math.PI/180;
  const dLng = (p2.lng-p1.lng) * Math.PI/180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))); 
};

const SearchableSelect = ({ label, options, selectedName, onSelect, onClear, placeholder }) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => { setQuery(selectedName || ""); }, [selectedName]);
  const filtered = Object.keys(options).filter(name => name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  return (
    <div style={{ position: 'relative' }}>
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
            <div key={name} onClick={() => { onSelect(options[name], name); setIsOpen(false); }} style={{ padding: '12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }}>{name}</div>
          ))}
        </div>
      )}
    </div>
  );
};

function ChangeView({ bounds, zoomIn }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      if (zoomIn) map.setView(bounds[0], 18, { animate: true }); 
      else map.fitBounds(bounds, { padding: [50, 50], animate: true }); 
    }
  }, [bounds, zoomIn, map]);
  return null;
}

const getNearestName = (latlng, landmarks) => {
  let minD = Infinity; let nearest = "Custom Point";
  Object.entries(landmarks).forEach(([name, coords]) => {
    const d = Math.pow(coords.lat - latlng.lat, 2) + Math.pow(coords.lng - latlng.lng, 2);
    if (d < minD) { minD = d; nearest = `Near ${name}`; }
  });
  return minD < 0.00002 ? nearest : "Custom Point";
};

function App() {
  const [landmarks, setLandmarks] = useState({});
  const [userLoc, setUserLoc] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [mode, setMode] = useState('walk');
  const [exploreData, setExploreData] = useState({});
  const [activeCategory, setActiveCategory] = useState("");
  const [mapTheme, setMapTheme] = useState('light'); 
  const [stops, setStops] = useState([
    { id: 1, latlng: null, name: "" },
    { id: 2, latlng: null, name: "" }
  ]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isJourneyActive, setIsJourneyActive] = useState(false);
  const [watchId, setWatchId] = useState(null); 
  const [liveSpeedKmh, setLiveSpeedKmh] = useState(null); 
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => { axios.get(`${API_BASE}/api/landmarks`).then(res => setLandmarks(res.data)); }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // --- NEW: Calculate if it is currently the 15 min Rush Hour window ---
  const currentMinutes = currentTime.getMinutes();
  const isCurrentlyRushHour = currentMinutes >= 50 || currentMinutes <= 5;

  const validStops = stops.filter(s => s.latlng !== null);
  const stopsHash = validStops.map(s => `${s.latlng.lat},${s.latlng.lng}`).join('|');

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const res = await axios.post(`${API_BASE}/api/route`, {
          stops: validStops.map(s => ({ lat: s.latlng.lat, lng: s.latlng.lng })),
          mode: mode
        });
        setRoutes(res.data); stopRealJourney(); 
      } catch (err) { alert(err.response?.data?.detail || "Error finding route."); setRoutes([]); }
    };
    if (validStops.length >= 2) fetchRoutes();
    else setRoutes([]);
  }, [stopsHash, mode]);

  const updateStop = (id, latlng, name) => {
    setStops(stops.map(s => s.id === id ? { ...s, latlng, name } : s));
  };

  const addStop = () => {
    if (stops.length >= 5) return;
    setStops([...stops, { id: Date.now(), latlng: null, name: "" }]);
  };

  const removeStop = (id) => {
    setStops(stops.filter(s => s.id !== id));
  };

  const handleExplore = async (category) => {
    if (activeCategory === category) { setActiveCategory(""); setExploreData({}); return; }
    try {
      const res = await axios.get(`${API_BASE}/api/explore/${category}`);
      setExploreData(res.data); setActiveCategory(category);
    } catch (err) { console.error("Could not load amenities"); }
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        const emptyIndex = stops.findIndex(s => !s.latlng);
        if (emptyIndex !== -1) {
          const newStops = [...stops];
          newStops[emptyIndex] = { ...newStops[emptyIndex], latlng: e.latlng, name: getNearestName(e.latlng, landmarks) };
          setStops(newStops);
        }
      },
    });
    return null;
  };

  const locateUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(coords); 
        updateStop(stops[0].id, coords, "My Current Location");
      }, () => alert("Location access denied."));
    }
  };

  const startRealJourney = () => {
    if (!navigator.geolocation) return;
    setIsJourneyActive(true); setIsSidebarOpen(false);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.speed) setLiveSpeedKmh(pos.coords.speed * 3.6);
      },
      (err) => { alert("GPS tracking failed."); setIsJourneyActive(false); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
    setWatchId(id);
  };

  const stopRealJourney = () => {
    setIsJourneyActive(false);
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); setWatchId(null); }
    setLiveSpeedKmh(null);
  };

  const resetAll = () => {
    setStops([{ id: 1, latlng: null, name: "" }, { id: 2, latlng: null, name: "" }]);
    setRoutes([]); setUserLoc(null); setExploreData({}); setActiveCategory(""); stopRealJourney();
  };

  const getRemainingStats = () => {
    if (!routes[0]) return { dist: 0, time: 0 };
    const finalStop = validStops[validStops.length - 1];
    
    if (!isJourneyActive || !userLoc || !finalStop) {
      return { 
        dist: (routes[0].distance_meters / 1000).toFixed(2), 
        time: Math.ceil(routes[0].time_minutes) 
      };
    }

    let minDistance = Infinity;
    let closestIndex = 0;
    const path = routes[0].path;

    for (let i = 0; i < path.length; i++) {
      const pt = { lat: path[i][0], lng: path[i][1] };
      const d = getDistanceMeters(userLoc, pt);
      if (d < minDistance) {
        minDistance = d;
        closestIndex = i;
      }
    }

    let remainingPathMeters = 0;
    for (let i = closestIndex; i < path.length - 1; i++) {
      const p1 = { lat: path[i][0], lng: path[i][1] };
      const p2 = { lat: path[i+1][0], lng: path[i+1][1] };
      remainingPathMeters += getDistanceMeters(p1, p2);
    }

    const totalPathMeters = routes[0].distance_meters;
    const ratio = totalPathMeters > 0 ? (remainingPathMeters / totalPathMeters) : 0;
    let remainingTime = routes[0].time_minutes * ratio;

    return { 
      dist: (remainingPathMeters / 1000).toFixed(2), 
      time: Math.ceil(remainingTime) 
    };
  };
  const stats = getRemainingStats();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'sans-serif', backgroundColor: '#f8fafc', overflow: 'hidden' }}>
      <style>{`
        .animated-path { stroke-dasharray: 15; animation: moveDash 1s linear infinite; } 
        @keyframes moveDash { to { stroke-dashoffset: -30; } }
        .pulse-badge { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
      `}</style>

      {/* --- SIDEBAR --- */}
      <div style={{ width: isSidebarOpen ? '400px' : '0px', flexShrink: 0, overflow: 'hidden', transition: 'width 0.3s ease-in-out', backgroundColor: 'white', borderRight: isSidebarOpen ? '1px solid #e2e8f0' : 'none', zIndex: 10, position: 'relative' }}>
        <div style={{ width: '400px', height: '100%', display: 'flex', flexDirection: 'column' }}> 
          
          <div style={{ padding: '24px', backgroundColor: '#0f172a', color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>IITK Navigator Pro</h1>
                <p style={{ margin: 0, fontSize: '10px', opacity: 0.6, letterSpacing: '1px' }}>TURN-BY-TURN DIRECTIONS</p>
              </div>
              
              {/* --- NEW: RUSH HOUR BADGE NEXT TO CLOCK --- */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isCurrentlyRushHour && (
                  <div className="pulse-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#fee2e2', padding: '4px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold', color: '#dc2626', border: '1px solid #fca5a5' }}>
                    <AlertTriangle size={12} /> RUSH HOUR
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1' }}>
                  <Clock size={14} color="#94a3b8" />
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '8px', padding: '4px', marginTop: '16px' }}>
              {[ { id: 'light', label: 'Standard' }, { id: 'dark', label: 'Dark Mode' }, { id: 'satellite', label: 'Satellite' } ].map(t => (
                <button
                  key={t.id} onClick={() => setMapTheme(t.id)}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', backgroundColor: mapTheme === t.id ? '#3b82f6' : 'transparent', color: mapTheme === t.id ? 'white' : '#94a3b8', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
               <button onClick={() => handleExplore('food')} style={{ padding: '8px 12px', borderRadius: '20px', border: activeCategory === 'food' ? '2px solid #eab308' : '1px solid #e2e8f0', backgroundColor: activeCategory === 'food' ? '#fef9c3' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}><Coffee size={14} color={activeCategory === 'food' ? '#ca8a04' : '#64748b'} /> Food</button>
               <button onClick={() => handleExplore('money')} style={{ padding: '8px 12px', borderRadius: '20px', border: activeCategory === 'money' ? '2px solid #eab308' : '1px solid #e2e8f0', backgroundColor: activeCategory === 'money' ? '#fef9c3' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}><Banknote size={14} color={activeCategory === 'money' ? '#ca8a04' : '#64748b'} /> ATMs</button>
               <button onClick={() => handleExplore('health')} style={{ padding: '8px 12px', borderRadius: '20px', border: activeCategory === 'health' ? '2px solid #eab308' : '1px solid #e2e8f0', backgroundColor: activeCategory === 'health' ? '#fef9c3' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}><Stethoscope size={14} color={activeCategory === 'health' ? '#ca8a04' : '#64748b'} /> Health</button>
            </div>

            <button onClick={locateUser} style={{ width: '100%', padding: '10px', marginBottom: '15px', backgroundColor: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><LocateFixed size={16} /> Use My Live Location</button>

            {stops.map((stop, index) => (
              <div key={stop.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <SearchableSelect
                    label={index === 0 ? "STARTING POINT" : index === stops.length - 1 ? "DESTINATION" : `WAYPOINT ${index}`}
                    options={landmarks} selectedName={stop.name} placeholder="Search or click map..."
                    onSelect={(c, n) => updateStop(stop.id, c, n)} onClear={() => updateStop(stop.id, null, "")}
                  />
                </div>
                {stops.length > 2 && (
                  <button onClick={() => removeStop(stop.id)} style={{ marginTop: '22px', padding: '12px', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}

            {stops.length < 5 && (
              <button onClick={addStop} style={{ width: '100%', padding: '10px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                <Plus size={16} /> Add Stop
              </button>
            )}

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
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: 'white', overflow: 'hidden' }}>
                
                {routes[0].has_traffic && (
                  <div style={{ backgroundColor: '#fef2f2', padding: '12px', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <AlertTriangle size={18} color="#ef4444" style={{ marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#991b1b' }}>High Traffic (Class Transition)</div>
                      <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>Academic Area paths are crowded. ETA has been increased.</div>
                    </div>
                  </div>
                )}

                {routes[0].steps.map((step, index) => (
                  <div key={index} style={{ padding: '12px 16px', borderBottom: index < routes[0].steps.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: step.instruction.includes('📍') ? '#fef3c7' : 'transparent' }}>
                    <div style={{ backgroundColor: step.instruction.includes('📍') ? '#f59e0b' : '#eff6ff', padding: '6px', borderRadius: '50%', color: step.instruction.includes('📍') ? 'white' : '#2563eb' }}>
                      {getTurnIcon(step.instruction)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{step.instruction}</div>
                      {step.distance > 0 && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>for {step.distance} meters</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={resetAll} style={{ width: '100%', padding: '14px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 'bold', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <RefreshCcw size={16} /> Reset All
            </button>
          </div>
        </div>
      </div>

      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
        style={{ position: 'absolute', left: isSidebarOpen ? '400px' : '0px', top: '20px', zIndex: 1000, transition: 'left 0.3s ease-in-out', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0 8px 8px 0', padding: '10px 4px', cursor: 'pointer', boxShadow: '4px 0 10px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center' }}
      >
        {isSidebarOpen ? <ChevronLeft size={20} color="#64748b" /> : <ChevronRight size={20} color="#64748b" />}
      </button>

      <main style={{ flex: 1, position: 'relative' }}>
        
        {routes.length > 0 && (
          <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, backgroundColor: 'white', padding: '15px 30px', borderRadius: '40px', boxShadow: '0 15px 30px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '25px', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: routes[0].has_traffic ? '#ef4444' : '#0f172a', lineHeight: '1' }}>
                {stats.time}<span style={{fontSize: '12px', marginLeft: '2px'}}>min</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginTop: '4px' }}>{stats.dist} km</div>
            </div>
            
            <div style={{ width: '1px', height: '35px', backgroundColor: '#e2e8f0' }} />
            
            {!isJourneyActive ? (
              <button onClick={startRealJourney} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '25px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(37,99,235,0.3)' }}>
                <Play size={18} fill="white" /> Start Journey
              </button>
            ) : (
              <button onClick={stopRealJourney} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '25px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(239,68,68,0.3)' }}>
                <Square size={18} fill="white" /> Stop
              </button>
            )}
          </div>
        )}

        <MapContainer center={[26.5123, 80.2329]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url={MAP_THEMES[mapTheme]} />
          <MapClickHandler />
          
          {userLoc && <Marker position={userLoc} icon={userIcon}><Tooltip permanent direction="top">{isJourneyActive ? "Live GPS" : "You are here"}</Tooltip></Marker>}
          
          {Object.entries(exploreData).map(([name, coords]) => (
            <Marker key={name} position={coords} icon={exploreIcon} eventHandlers={{ click: () => { updateStop(stops[stops.length-1].id, coords, name); } }}>
              <Tooltip direction="top" offset={[0, -30]} className="font-bold">{name}</Tooltip>
            </Marker>
          ))}

          {validStops.map((stop, i) => {
             const iconToUse = i === 0 ? startIcon : (i === validStops.length - 1 ? endIcon : waypointIcon);
             if (i === 0 && isJourneyActive) return null;
             return <Marker key={stop.id} position={stop.latlng} icon={iconToUse}><Tooltip permanent direction="top" className="font-bold">{stop.name}</Tooltip></Marker>;
          })}
          
          {routes[0] && (
            <Polyline positions={routes[0].path} color={routes[0].has_traffic ? "#ef4444" : "#2563eb"} weight={6} className={isJourneyActive ? "animated-path" : ""} />
          )}
          
          {routes[0] && mode !== 'walk' && validStops.length > 0 && (
            <Polyline positions={[routes[0].path[routes[0].path.length - 1], validStops[validStops.length-1].latlng]} color="#94a3b8" weight={4} dashArray="8, 8" />
          )}
          
          {routes.length > 0 && (
            <ChangeView bounds={isJourneyActive && userLoc ? [[userLoc.lat, userLoc.lng]] : routes[0].path} zoomIn={isJourneyActive} />
          )}
        </MapContainer>
      </main>
    </div>
  );
}

export default App;