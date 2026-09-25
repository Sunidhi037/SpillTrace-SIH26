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


/* ------------------------------------------------------------------ */
/* Session patching                                                    */
/* ------------------------------------------------------------------ */

export function patchInvestigationData(id, patch) {
  if (!id) return;
  const current = loadInvestigationData(id) || {};
  saveInvestigationData(id, { ...current, ...patch });
}

/* ------------------------------------------------------------------ */
/* Backend shape adapters (moved out of pages/Investigation.jsx)       */
/* ------------------------------------------------------------------ */

export function normalizeCompatibility(value) {
  if (!value) return null;

  return {
    ...value,
    status:
      value.status ||
      (value.compatible === true
        ? "pass"
        : value.compatible === false
          ? "blocked"
          : "unknown"),
  };
}

// The live detect endpoint returns SpillResponse (lowercase custom status,
// area_sq_km/detected_at at top level, no .metadata). This adapter maps it
// onto the DetectionResponse-like shape the UI reads.
const DETECTION_STATUS_MAP = {
  DETECTED: "COMPLETED",
  DETECTION_FAILED: "FAILED",
  UPLOADED: "QUEUED",
};

export function normalizeDetectionJob(job) {
  if (!job) return null;

  const geo = normalizeDetectionGeometry(job);

  const rawStatus = String(job.status || "").toUpperCase();
  const status = DETECTION_STATUS_MAP[rawStatus] || rawStatus || "UNKNOWN";

  const centroid =
    job.metadata?.centroid || (geo ? getGeoJSONCentroid(geo) : null);

  const metadata = job.metadata || {
    detector_name: job.detector_name || null,
    area_sq_km: job.area_sq_km ?? null,
    centroid,
    extra: { area_sq_km: job.area_sq_km ?? null },
  };

  return {
    ...job,
    status,
    metadata,
    geojson: geo,
    isMock: job.isMock === true,
  };
}

export function geometryProperties(job) {
  const metadata = job?.metadata || {};
  const extra = metadata?.extra || {};

  return {
    centroid: metadata.centroid || null,
    area_sq_km:
      extra.area_sq_km ??
      extra.area_km2 ??
      metadata.area_sq_km ??
      metadata.area_km2 ??
      null,
    perimeter_m: extra.perimeter_m ?? metadata.perimeter_m ?? null,
    confidence:
      extra.confidence ??
      extra.mean_probability ??
      metadata.confidence ??
      metadata.mean_probability ??
      null,
  };
}

export function findTrackForCandidate(geojson, candidate) {
  if (!geojson || !candidate) return null;

  const features = geojson.features || [];

  const targetIds = [candidate.mmsi, candidate.candidate_id, candidate.vessel_id]
    .filter(Boolean)
    .map(String);

  if (!targetIds.length) return null;

  return (
    features.find((feature) => {
      const properties = feature?.properties || {};
      const values = [
        properties.mmsi,
        properties.candidate_id,
        properties.vessel_id,
      ]
        .filter(Boolean)
        .map(String);
      return values.some((value) => targetIds.includes(value));
    }) || null
  );
}

/* ------------------------------------------------------------------ */
/* Track helpers                                                       */
/* ------------------------------------------------------------------ */

export function featureCount(geojson) {
  return featureCollectionToFeatures(geojson).length;
}

/**
 * Returns [{ timestamp, lat, lon, sog, cog, heading }] for a track feature.
 * The AIS service stores history in properties.positions
 * ({timestamp_utc, latitude, longitude, sog_knots, cog_deg, heading_deg}).
 * Falls back to parallel timestamp arrays + LineString coordinates.
 */
export function getTrackPositions(track) {
  if (!track) return [];
  const p = track.properties || {};

  if (Array.isArray(p.positions) && p.positions.length) {
    return p.positions.map((pos) => ({
      timestamp: pos.timestamp_utc ?? null,
      lat: pos.latitude ?? null,
      lon: pos.longitude ?? null,
      sog: pos.sog_knots ?? null,
      cog: pos.cog_deg ?? null,
      heading: pos.heading_deg ?? null,
    }));
  }

  const stamps = p.timestamps_utc ?? p.timestamps ?? p.time ?? p.times ?? [];
  const coords = track.geometry?.coordinates;

  if (Array.isArray(stamps) && stamps.length) {
    const line =
      track.geometry?.type === "LineString" && Array.isArray(coords)
        ? coords
        : [];
    return stamps.map((timestamp, i) => ({
      timestamp,
      lat: line[i]?.[1] ?? null,
      lon: line[i]?.[0] ?? null,
      sog: null,
      cog: null,
      heading: null,
    }));
  }

  return [];
}

export function trackKey(feature) {
  const p = feature?.properties || {};
  return p.mmsi != null ? String(p.mmsi) : null;
}
