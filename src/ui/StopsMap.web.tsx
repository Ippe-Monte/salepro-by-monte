import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import type { Stop } from './StopsMap';

/** OpenStreetMap + Leaflet. Numbered pins in visiting order, joined by a dashed line. Optional tap-to-pick. */
export function StopsMap({ stops, height = 340, onPick, picked }: { stops: Stop[]; height?: number; onPick?: (lat: number, lng: number) => void; picked?: { lat: number; lng: number } | null }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([13.7563, 100.5018], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngTuple[] = [];
    for (const s of stops) {
      pts.push([s.lat, s.lng]);
      const icon = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div style="width:30px;height:30px;border-radius:15px;background:#1976b8;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:800 14px system-ui">${s.n}</div>` });
      L.marker([s.lat, s.lng], { icon, title: s.label }).addTo(g).bindTooltip(s.label);
    }
    if (pts.length > 1) L.polyline(pts, { color: '#1976b8', weight: 3, dashArray: '6 8' }).addTo(g);
    if (picked) {
      pts.push([picked.lat, picked.lng]);
      L.circleMarker([picked.lat, picked.lng], { radius: 9, color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.9 }).addTo(g);
    }
    if (pts.length === 1) m.setView(pts[0]!, 15);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
  }, [stops, picked]);

  return <View style={{ height, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1' }}><div ref={el} style={{ width: '100%', height: '100%' }} /></View>;
}
