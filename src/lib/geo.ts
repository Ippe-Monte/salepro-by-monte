/** Coordinate helpers. Pure functions so they can be unit-tested without a device. */

export type Coords = { lat: number; lng: number };

/** Parse "13.7563, 100.5018" (or two separate strings). Returns null when invalid. */
export function parseCoords(latText: string, lngText?: string): Coords | null {
  let a = latText.trim();
  let b = (lngText ?? '').trim();
  if (lngText === undefined) {
    const parts = a.split(/[,\s]+/).filter(Boolean);
    if (parts.length !== 2) return null;
    [a, b] = parts as [string, string];
  }
  if (!/^-?\d+(\.\d+)?$/.test(a) || !/^-?\d+(\.\d+)?$/.test(b)) return null;
  const lat = Number(a);
  const lng = Number(b);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** Both empty is fine (no coordinates). One without the other is an error. */
export function validateCoordPair(latText: string, lngText: string): string | null {
  const a = latText.trim();
  const b = lngText.trim();
  if (!a && !b) return null;
  if (!a || !b) return 'กรอกละติจูดและลองจิจูดให้ครบทั้งคู่';
  return parseCoords(a, b) ? null : 'พิกัดไม่ถูกต้อง (ละติจูด -90 ถึง 90, ลองจิจูด -180 ถึง 180)';
}

/** Link that opens Google Maps at the point. Needs no API key. */
export function mapsLink(c: Coords): string {
  return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
}

/** Link for turn-by-turn directions to the point. */
export function directionsLink(c: Coords): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
}

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Order stops by nearest-neighbour from a start point. A simple, explainable route order. */
export function nearestOrder<T extends { coords: Coords | null }>(start: Coords | null, stops: T[]): T[] {
  const withC = stops.filter((s) => s.coords);
  const without = stops.filter((s) => !s.coords);
  const out: T[] = [];
  let cur = start ?? withC[0]?.coords ?? null;
  const left = [...withC];
  while (left.length) {
    let bi = 0;
    if (cur) {
      let bd = Infinity;
      left.forEach((s, i) => {
        const d = distanceKm(cur as Coords, s.coords as Coords);
        if (d < bd) { bd = d; bi = i; }
      });
    }
    const [next] = left.splice(bi, 1) as [T];
    out.push(next);
    cur = next.coords;
  }
  return [...out, ...without];
}

/** "850 ม." under 1 km, otherwise "12.3 กม." */
export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toFixed(km < 10 ? 1 : 0)} กม.`;
}

/** Distance of each leg between consecutive stops (stops without coordinates are skipped, not bridged). */
export function legs(stops: (Coords | null)[]): (number | null)[] {
  return stops.map((s, i) => (i === 0 || !s || !stops[i - 1] ? null : distanceKm(stops[i - 1] as Coords, s)));
}
