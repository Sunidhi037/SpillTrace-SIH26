export const NA = "Not available";

export function formatUtc(value, { withYear = true } = {}) {
  if (!value) return NA;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NA;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export function formatDate(value) {
  if (!value) return NA;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NA;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatKm2(value) {
  return value != null && !Number.isNaN(Number(value))
    ? `${Number(value).toFixed(2)} km²`
    : NA;
}

// GeoJSON position order is [lon, lat].
export function formatLatLon(point) {
  if (!Array.isArray(point) || point.length < 2) return NA;
  const [lon, lat] = point;
  if (typeof lat !== "number" || typeof lon !== "number") return NA;
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export function pct(value) {
  return value != null && !Number.isNaN(Number(value))
    ? Math.round(Number(value) * 100)
    : null;
}

export function shortId(value, n = 8) {
  if (!value) return "";
  const s = String(value);
  return s.length > n + 2 ? `${s.slice(0, n)}…` : s;
}
