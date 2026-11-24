/** Company lookup on OpenStreetMap (Nominatim). Free, no key; coverage of Thai companies is partial. */
export type Place = { id: string; name: string; address: string; province: string; lat: number; lng: number; phone: string; website: string };

type Raw = {
  place_id: number; name?: string; display_name: string; lat: string; lon: string;
  address?: Record<string, string>; extratags?: Record<string, string>;
};

export function parsePlaces(rows: Raw[]): Place[] {
  return rows.map((r) => {
    const a = r.address ?? {}; const x = r.extratags ?? {};
    const street = [a.house_number, a.road, a.neighbourhood ?? a.suburb, a.city_district ?? a.district ?? a.county, a.postcode].filter(Boolean).join(' ');
    const name = r.name || a.office || a.shop || a.amenity || r.display_name.split(',')[0] || '';
    return {
      id: String(r.place_id), name: name.trim(), address: street || r.display_name, province: a.state ?? a.province ?? a.city ?? '',
      lat: Math.round(Number(r.lat) * 1e6) / 1e6, lng: Math.round(Number(r.lon) * 1e6) / 1e6,
      phone: x.phone ?? x['contact:phone'] ?? '', website: x.website ?? x['contact:website'] ?? '',
    };
  }).filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=8&accept-language=th,en&countrycodes=th&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return parsePlaces((await res.json()) as Raw[]);
}
