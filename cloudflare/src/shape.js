// Nominatim result -> {lat, lon, title, address}
export function title(addr = {}) {
  const place = ["city", "town", "village", "suburb", "county"].map((k) => addr[k]).find(Boolean) || "";
  return [place, addr.state, addr.country].filter(Boolean).join(", ");
}

export function shape(hit) {
  return {
    lat: Math.round(parseFloat(hit.lat) * 1e6) / 1e6,
    lon: Math.round(parseFloat(hit.lon) * 1e6) / 1e6,
    title: title(hit.address),
    address: hit.display_name || "",
  };
}
