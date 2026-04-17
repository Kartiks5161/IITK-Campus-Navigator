import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import axios from 'axios';
import { Navigation, RefreshCcw, Bike, Footprints, Car, Search, MapPin, Clock, Ruler, X } from 'lucide-react';

const API_BASE = "http://localhost:8000";

// --- SEARCHABLE DROPDOWN ---
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
          type="text"
          placeholder={placeholder}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
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

function App() {
  const [landmarks, setLandmarks] = useState({});
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [startName, setStartName] = useState("");
  const [endName, setEndName] = useState("");
  const [routes, setRoutes] = useState([]);
  const [mode, setMode] = useState('walk');

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
    } catch (err) { console.error("API Error:", err); }
  };

  useEffect(() => { if(start && end) fetchRoutes(start, end, mode); }, [mode, start, end]);

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        if (!start) { setStart(e.latlng); setStartName("Custom Point"); }
        else if (!end) { setEnd(e.latlng); setEndName("Custom Point"); }
      },
    });
    return null;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'sans-serif', backgroundColor: '#f8fafc' }}>
      
      <aside style={{ width: '380px', backgroundColor: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: '24px', backgroundColor: '#0f172a', color: 'white' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>IITK Navigator</h1>
          <p style={{ margin: 0, fontSize: '10px', opacity: 0.6, letterSpacing: '1px' }}>CAMPUS GIS DASHBOARD</p>
        </div>

        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          <SearchableSelect label="STARTING POINT" options={landmarks} selectedName={startName} placeholder="Search or click map..." onSelect={(c, n) => { setStart(c); setStartName(n); }} onClear={() => { setStart(null); setStartName(""); setRoutes([]); }} />
          <SearchableSelect label="DESTINATION" options={landmarks} selectedName={endName} placeholder="Search or click map..." onSelect={(c, n) => { setEnd(c); setEndName(n); }} onClear={() => { setEnd(null); setEndName(""); setRoutes([]); }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '25px' }}>
            {['walk', 'cycle', 'drive'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: '12px', borderRadius: '10px', border: mode === m ? '2px solid #2563eb' : '1px solid #e2e8f0', backgroundColor: mode === m ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                {m === 'walk' ? <Footprints size={18}/> : m === 'cycle' ? <Bike size={18}/> : <Car size={18}/>}
                <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '4px' }}>{m.toUpperCase()}</div>
              </button>
            ))}
          </div>

          {/* --- JOURNEY STATS CARD --- */}
          {routes.length > 0 && (
            <div style={{ backgroundColor: '#2563eb', color: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.8, marginBottom: '15px', letterSpacing: '1px' }}>JOURNEY DETAILS</div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
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
          )}
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}>
          <button 
            onClick={() => { setStart(null); setEnd(null); setStartName(""); setEndName(""); setRoutes([]); }} 
            style={{ width: '100%', padding: '14px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 'bold', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <RefreshCcw size={16} /> Reset All
          </button>
        </div>
      </aside>

      <main style={{ flex: 1 }}>
        <MapContainer center={[26.5123, 80.2329]} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapClickHandler />
          {start && <Marker position={start} />}
          {end && <Marker position={end} />}
          {routes[0] && <Polyline positions={routes[0].path} color="#2563eb" weight={6} />}
          {routes.length > 0 && <ChangeView bounds={routes[0].path} />}
        </MapContainer>
      </main>
    </div>
  );
}

export default App;