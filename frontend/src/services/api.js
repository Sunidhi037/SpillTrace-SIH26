import axios from "axios";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\\$/, "");

// backend/app/main.py mounts spills.router under plain "/api" and
// everything else (system, scenes, detections, candidates, reports, ais)
// under "/api/v1". That split is real and intentional on the backend side
// (see the comment block above app.include_router(...) calls in main.py) --
// do not "clean this up" into one consistent prefix without updating
// main.py to match, or every request below will 404.
const API_V1_BASE = "/api/v1";

// GET /api/v1/spills/{spill_id}/candidates already exists on the backend
// (app/api/routes/candidates.py -> read_spill_candidates), so it is used by
// default. VITE_CANDIDATES_URL is kept as an optional override for pointing
// at a different/mock endpoint if ever needed.
const CANDIDATES_URL =
  import.meta.env.VITE_CANDIDATES_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: "application/json",
  },
  timeout: 30000,
});

const encodeId = (value) =>
  encodeURIComponent(String(value));

export const getApiError = (error) => {
  if (!error) {
    return {
      status: null,
      code: null,
      message: "Unknown error.",
      details: null,
      isNetworkError: false,
      isTimeout: false,
      raw: null,
    };
  }

  const isTimeout =
    error.code === "ECONNABORTED" ||
    error.code === "ETIMEDOUT";

  const isNetworkError =
    !error.response && !isTimeout;

  if (isTimeout) {
    return {
      status: null,
      code: "ERR_TIMEOUT",
      message:
        "The request timed out. The backend may be slow or unreachable.",
      details: null,
      isNetworkError: false,
      isTimeout: true,
      raw: null,
    };
  }

  if (isNetworkError) {
    return {
      status: null,
      code: "ERR_NETWORK",
      message:
        "Could not reach the SpillTrace backend. Check that it is running and VITE_API_BASE_URL is correct.",
      details: null,
      isNetworkError: true,
      isTimeout: false,
      raw: null,
    };
  }

  const status = error.response?.status ?? null;
  const data = error.response?.data ?? {};
  const detail = data?.detail;

  // FastAPI's HTTPException(detail={code, message, details}) -- this is
  // what spills.py's /detect raises on a detector failure (DETECTION_FAILED).
  if (detail && typeof detail === "object") {
    return {
      status,
      code: detail.code ?? detail.error ?? null,
      message: detail.message ?? "Something went wrong.",
      details: detail.details ?? null,
      isNetworkError: false,
      isTimeout: false,
      raw: data,
    };
  }

  // FastAPI's HTTPException(detail="plain string") -- e.g. "Spill not found".
  if (typeof detail === "string") {
    return {
      status,
      code: data?.error ?? null,
      message: detail,
      details: data?.details ?? null,
      isNetworkError: false,
      isTimeout: false,
      raw: data,
    };
  }

  // main.py's global exception handler: {"error": "...", "message": "..."}
  if (data?.error && typeof data.error === "string") {
    return {
      status,
      code: data.error,
      message: data.message ?? "Something went wrong.",
      details: data.details ?? null,
      isNetworkError: false,
      isTimeout: false,
      raw: data,
    };
  }

  return {
    status,
    code: null,
    message:
      error.message || "Something went wrong.",
    details: null,
    isNetworkError: false,
    isTimeout: false,
    raw: data,
  };
};


/* ---------------- HEALTH ---------------- */

// Real route is GET /health (no /api prefix at all -- defined
// directly on the FastAPI app in main.py, not under any router).
export const checkHealth = async () =>
  (await api.get("/health")).data;


/* ---------------- SCENES ---------------- */

export const getScenes = async () =>
  (await api.get(`${API_V1_BASE}/scenes`)).data;

export const getSceneManifest = async (sceneId) => {
  if (!sceneId) {
    throw new Error("Scene ID is required.");
  }

  return (
    await api.get(
      `${API_V1_BASE}/scenes/${encodeId(sceneId)}/manifest`
    )
  ).data;
};

export const getSceneCompatibility = async (sceneId) => {
  if (!sceneId) {
    throw new Error("Scene ID is required.");
  }

  return (
    await api.get(
      `${API_V1_BASE}/scenes/${encodeId(sceneId)}/compatibility`
    )
  ).data;
};


/* ---------------- SPILL ---------------- */

export const uploadSpill = async (file) => {
  if (!file) {
    throw new Error("A file is required.");
  }

  const formData = new FormData();
  formData.append("file", file);

  // IMPORTANT: do NOT set Content-Type manually here. A multipart
  // request needs a boundary parameter that only the browser/axios
  // can generate correctly when it builds the FormData body itself.
  // Setting "multipart/form-data" by hand (no boundary) produces a
  // request FastAPI's multipart parser cannot read, and /upload fails
  // silently on the frontend side even though nothing shows in the
  // network tab as obviously wrong.
  return (
    await api.post("/api/spills/upload", formData)
  ).data;
};

export const getSpill = async (spillId) => {
  if (!spillId) {
    throw new Error("Spill ID is required.");
  }

  return (
    await api.get(
      `/api/spills/${encodeId(spillId)}`
    )
  ).data;
};


/* ---------------- DETECTION ---------------- */

/**
 * Triggers detection for an already-uploaded spill.
 *
 * POST /api/spills/{spill_id}/detect -- no file body, no scene_id, no
 * file_path. The backend (app/api/routes/spills.py -> detect_spill) runs
 * synchronously against the file it already saved during upload and
 * returns the FINAL result directly -- there is no job queue for this
 * endpoint, so no polling is needed.
 *
 * Response shape (SpillResponse, app/schemas/contracts.py):
 *   {
 *     spill_id, status: "detected" | "detection_failed",
 *     message,
 *     geometry: { type: "FeatureCollection", coordinates: null,
 *                 geojson: <the real GeoJSON FeatureCollection> } | null,
 *     area_sq_km, detected_at,
 *   }
 *
 * Note the double-wrapping: the real slick polygons are at
 * `response.geometry.geojson`, not `response.geometry` directly --
 * utils/investigation.js's normalizeGeoJSON()/normalizeDetectionGeometry()
 * already know to unwrap this.
 *
 * On a detector failure this rejects with an HTTPException whose `detail`
 * is `{code: "DETECTION_FAILED", message, details}` -- getApiError() above
 * already parses that shape.
 */
export const detectSpill = async (spillId) => {
  if (!spillId) {
    throw new Error("Spill ID is required.");
  }

  return (
    await api.post(
      `/api/spills/${encodeId(spillId)}/detect`,
      undefined,
      // Detection runs synchronously on the backend and can take much
      // longer than a normal API call, so it gets its own longer timeout
      // instead of the 30s default used for everything else.
      { timeout: 180000 }
    )
  ).data;
};


/* ---------------- DRIFT ---------------- */

export const runDrift = async ({
  direction,
  spillId,
  acquisitionTimeUtc,
  slickGeojson,
  parameters,
}) => {
  if (
    !["hindcast", "forecast"].includes(direction)
  ) {
    throw new Error(
      'direction must be "hindcast" or "forecast".'
    );
  }

  if (!slickGeojson) {
    throw new Error(
      "slick_geojson is required."
    );
  }

  return (
    await api.post(
      `/api/drift/${direction}`,
      {
        spill_id: spillId ?? undefined,
        acquisition_time_utc:
          acquisitionTimeUtc ?? undefined,
        slick_geojson: slickGeojson,
        parameters,
      }
    )
  ).data;
};

export const runHindcast = (args) =>
  runDrift({
    ...args,
    direction: "hindcast",
  });

export const runForecast = (args) =>
  runDrift({
    ...args,
    direction: "forecast",
  });


/* ---------------- AIS ---------------- */

/**
 * GET /api/v1/ais/tracks (app/api/routes/ais.py).
 *
 * start_time and end_time are REQUIRED query params on the backend -- it
 * 422s without them. If the caller doesn't have a more specific window
 * (e.g. the spill's detected_at), this defaults to the 7 days up to now.
 *
 * Spatial filtering is optional and mutually exclusive on the backend
 * (bbox OR lat/lon/radius_km OR corridor_geojson, never more than one) --
 * pass at most one of those three.
 */
export const getAisTracks = async (
  spillId,
  {
    startTime,
    endTime,
    lat,
    lon,
    radiusKm,
    bbox,
    corridorGeojson,
    mmsi,
    limit,
  } = {}
) => {
  if (!spillId) {
    const error = new Error(
      "A real spill ID is required for AIS."
    );

    error.code = "NO_SPILL_ID";

    throw error;
  }

  const end = endTime ? new Date(endTime) : new Date();
  const start = startTime
    ? new Date(startTime)
    : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const params = {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };

  if (bbox) {
    params.bbox = Array.isArray(bbox) ? bbox.join(",") : bbox;
  } else if (lat != null && lon != null) {
    params.lat = lat;
    params.lon = lon;
    if (radiusKm != null) {
      params.radius_km = radiusKm;
    }
  } else if (corridorGeojson) {
    params.corridor_geojson =
      typeof corridorGeojson === "string"
        ? corridorGeojson
        : JSON.stringify(corridorGeojson);
  }

  if (mmsi) params.mmsi = mmsi;
  if (limit) params.limit = limit;

  return (
    await api.get(`${API_V1_BASE}/ais/tracks`, { params })
  ).data;
};


/* ---------------- CANDIDATES ---------------- */

export const getCandidates = async (spillId) => {
  if (!spillId) {
    const error = new Error(
      "A real spill ID is required for candidates."
    );

    error.code = "NO_SPILL_ID";

    throw error;
  }

  // Use an explicit override if one is configured, otherwise call the
  // real backend route directly -- GET /api/v1/spills/{id}/candidates
  // exists (app/api/routes/candidates.py -> read_spill_candidates).
  const target = CANDIDATES_URL
    ? (CANDIDATES_URL.includes("{spillId}")
        ? CANDIDATES_URL.replaceAll("{spillId}", encodeId(spillId))
        : CANDIDATES_URL)
    : `${API_V1_BASE}/spills/${encodeId(spillId)}/candidates`;

  return (await api.get(target)).data;
};

export const rankCandidates = async (
  spillId,
  {
    compatibility,
    driftEvidence,
    candidates = [],
    limit = 10,
  }
) => {
  if (!spillId) {
    throw new Error(
      "Spill ID is required."
    );
  }

  return (
    await api.post(
      `${API_V1_BASE}/spills/${encodeId(
        spillId
      )}/candidates/rank`,
      {
        compatibility,
        drift_evidence: driftEvidence,
        candidates,
        limit,
      }
    )
  ).data;
};

export const getCandidateRun = async (
  spillId,
  runId
) =>
  (
    await api.get(
      `${API_V1_BASE}/spills/${encodeId(
        spillId
      )}/candidate-runs/${encodeId(runId)}`
    )
  ).data;

export const getCandidateDetail = async (
  spillId,
  runId,
  candidateId
) =>
  (
    await api.get(
      `${API_V1_BASE}/spills/${encodeId(
        spillId
      )}/candidate-runs/${encodeId(
        runId
      )}/candidates/${encodeId(
        candidateId
      )}`
    )
  ).data;


/* ---------------- REPORT ---------------- */

export const createInvestigationReport =
  async (payload) =>
    (
      await api.post(
        `${API_V1_BASE}/reports/investigation`,
        payload
      )
    ).data;

export const createInvestigationReportHtml =
  async (payload) =>
    (
      await api.post(
        `${API_V1_BASE}/reports/investigation/html`,
        payload,
        {
          responseType: "text",
        }
      )
    ).data;


/* ---------------- URL HELPER ---------------- */

export const resolveApiUrl = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith("/")) {
    return `${API_BASE_URL}${value}`;
  }

  // detector_service._to_artifact_url() already rewrites any filesystem
  // path the detector returns into "/artifacts/<filename>" (see main.py's
  // StaticFiles mount), so by the time a value gets here it should already
  // start with "/" and be handled above. Anything that reaches this line
  // is neither an absolute URL nor a "/"-rooted path (e.g. a bare
  // filesystem path that slipped through), which a browser cannot fetch --
  // return null rather than guessing.
  return null;
};

export default api;
