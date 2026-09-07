const PREFIX = "spilltrace:investigation:";

export function saveInvestigationData(id, data) {
  if (!id) return;

  try {
    sessionStorage.setItem(
      `${PREFIX}${id}`,
      JSON.stringify(data)
    );
  } catch {
    // Storage is optional.
  }
}

export function loadInvestigationData(id) {
  if (!id) return null;

  try {
    const raw = sessionStorage.getItem(
      `${PREFIX}${id}`
    );

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearInvestigationData(id) {
  if (!id) return;

  try {
    sessionStorage.removeItem(
      `${PREFIX}${id}`
    );
  } catch {
    // no-op
  }
}


export function normalizeGeoJSON(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return null;
  }

  // IMPORTANT: check for actual content, not just the `type` string.
  // app/schemas/contracts.py's SpillGeometry ALWAYS sets
  // type: "FeatureCollection" on its outer wrapper even when the real
  // GeoJSON lives nested one level deeper under `.geojson` (coordinates
  // stays null on the wrapper in that case). Matching on `type` alone
  // would return that empty wrapper here and silently drop the real
  // slick polygon instead of falling through to the `.geojson` check
  // below.
  if (
    value.type === "FeatureCollection" &&
    Array.isArray(value.features)
  ) {
    return value;
  }

  if (
    value.type === "Feature" &&
    value.geometry
  ) {
    return value;
  }

  if (
    value.type &&
    value.coordinates
  ) {
    return {
      type: "Feature",
      properties:
        value.properties || {},
      geometry: value,
    };
  }

  if (value.geojson) {
    return normalizeGeoJSON(
      value.geojson
    );
  }

  if (value.geometry) {
    return normalizeGeoJSON(
      value.geometry
    );
  }

  return null;
}


export function featureCollectionToFeatures(
  value
) {
  const geo = normalizeGeoJSON(value);

  if (!geo) return [];

  return geo.type === "FeatureCollection"
    ? geo.features || []
    : [geo];
}


export function getGeoJSONCentroid(
  geojson
) {
  const features =
    featureCollectionToFeatures(
      geojson
    );

  const points = [];

  const walk = (coords) => {
    if (!Array.isArray(coords)) {
      return;
    }

    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      points.push([
        coords[0],
        coords[1],
      ]);

      return;
    }

    coords.forEach(walk);
  };

  features.forEach((feature) => {
    walk(
      feature.geometry?.coordinates
    );
  });

  if (!points.length) {
    return null;
  }

  const sum = points.reduce(
    (a, p) => [
      a[0] + p[0],
      a[1] + p[1],
    ],
    [0, 0]
  );

  return [
    sum[0] / points.length,
    sum[1] / points.length,
  ];
}


export function normalizeDetectionGeometry(
  response
) {
  const direct = normalizeGeoJSON(
    response?.geometry
  );

  if (direct) {
    return direct;
  }

  return normalizeGeoJSON(
    response?.geojson
  );
}


export function normalizeAisResponse(
  payload
) {
  if (!payload) return null;

  if (
    payload.type === "FeatureCollection" ||
    payload.type === "Feature"
  ) {
    return payload;
  }

  return (
    payload.tracks_geojson ||
    payload.geojson ||
    payload.tracks ||
    null
  );
}


export function normalizeCandidateResponse(
  payload
) {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return {
      candidates: payload,
    };
  }

  if (
    Array.isArray(
      payload.candidates
    )
  ) {
    return payload;
  }

  if (
    Array.isArray(payload.results)
  ) {
    return {
      ...payload,
      candidates:
        payload.results,
    };
  }

  return null;
}
