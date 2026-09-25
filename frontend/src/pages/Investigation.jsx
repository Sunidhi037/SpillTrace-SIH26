import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import {
  createInvestigationReport,
  createInvestigationReportHtml,
  detectSpill,
  getAisTracks,
  getApiError,
  getCandidateDetail,
  getScenes,
  getSceneCompatibility,
  getSceneManifest,
  getSpill,
  rankCandidates,
  runForecast,
  runHindcast,
} from "../services/api";

import Section from "../components/ui/Section";
import CompatibilityStatus from "../components/Scenario/CompatibilityStatus";
import SceneMetadata from "../components/Scenario/SceneMetadata";
import DetectionCard from "../components/Detection/DetectionCard";
import DriftPanel from "../components/Drift/DriftPanel";
import AisPanel from "../components/AIS/AisPanel";
import CandidatePanel from "../components/Candidates/CandidatePanel";
import EvidenceDrawer from "../components/Candidates/EvidenceDrawer";
import AISTimeline from "../components/Timeline/AISTimeline";
import InvestigationHeader from "../components/Investigation/InvestigationHeader";
import InvestigationSummary from "../components/Investigation/InvestigationSummary";
import InvestigationMap from "../components/Map/InvestigationMap";
import MapLayers from "../components/Map/MapLayers";
import MapLegend from "../components/Map/MapLegend";

import {
  featureCount,
  findTrackForCandidate,
  geometryProperties,
  getTrackPositions,
  loadInvestigationData,
  normalizeAisResponse,
  normalizeCompatibility,
  normalizeDetectionJob,
  normalizeGeoJSON,
  patchInvestigationData,
  trackKey,
} from "../utils/investigation";
import { computeStages } from "../utils/stages";
import { buildReportPayload, buildLocalInvestigationReportHtml } from "../utils/report";

const SECTION_FOR_STAGE = {
  detection: "detection",
  hindcast: "drift",
  forecast: "drift",
  ais: "ais",
  ranking: "candidates",
  evidence: "evidence",
};

function resolveCandidateTrack(candidate, aisTracksGeojson) {
  if (!candidate) return null;

  // Track embedded directly in the candidate
  if (candidate.track_reference && typeof candidate.track_reference === "object") {
    return normalizeGeoJSON(candidate.track_reference);
  }

  // Otherwise find it in the loaded AIS FeatureCollection. (A string
  // track_reference is only a source pointer, not fetchable geometry.)
  return findTrackForCandidate(aisTracksGeojson, candidate);
}

/* -------------------------------------------------------------------------- */

export default function Investigation() {
  const { id } = useParams();
  // key={id} resets all workflow state when navigating between investigations
  return <InvestigationView key={id} id={id} />;
}

function InvestigationView({ id }) {
  const panelRef = useRef(null);
  const focusCounter = useRef(0);

  /* ---------------------------- scene state ---------------------------- */

  const [scenes, setScenes] = useState([]);
  const [scene, setScene] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [sceneLoading, setSceneLoading] = useState(true);
  const [sceneError, setSceneError] = useState(null);
  const [compatibility, setCompatibility] = useState(null);
  const [compatibilityLoading, setCompatibilityLoading] = useState(true);

  /* ------------------------- spill / detection ------------------------- */

  const [spill, setSpill] = useState(null);
  const [spillError, setSpillError] = useState(null);
  const [detection, setDetection] = useState(null);
  const [detectionLoading, setDetectionLoading] = useState(false);
  const [detectionError, setDetectionError] = useState(null);
  const [slickGeojson, setSlickGeojson] = useState(null);
  const slickIsMock = false;

  /* -------------------------------- drift ------------------------------ */

  const [hindcastResult, setHindcastResult] = useState(null);
  const [forecastResult, setForecastResult] = useState(null);
  const [hindcastLoading, setHindcastLoading] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [hindcastError, setHindcastError] = useState(null);
  const [forecastError, setForecastError] = useState(null);

  /* --------------------------------- AIS ------------------------------- */

  const [aisTracksGeojson, setAisTracksGeojson] = useState(null);
  const [aisLoading, setAisLoading] = useState(false);
  const [aisError, setAisError] = useState(null);
  const [selectedAisTrack, setSelectedAisTrack] = useState(null);

  /* ------------------------------ candidates --------------------------- */

  const [candidateRun, setCandidateRun] = useState(null);
  const [candidateError, setCandidateError] = useState(null);
  const [candidateBlockedDetails, setCandidateBlockedDetails] = useState(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  /* ------------------------- timeline / report / map ------------------- */

  const [timelineIndex, setTimelineIndex] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  const [basemap, setBasemap] = useState("standard");
  const [mapFocus, setMapFocus] = useState(null);
  const [layers, setLayers] = useState({
    sarSource: true,
    slick: true,
    hindcastOrigin: true,
    forecastCorridor: true,
    aisTracks: true,
    candidateTrack: true,
  });

  const toggleLayer = useCallback((key) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const requestFocus = useCallback((geojsons, maxZoom) => {
    focusCounter.current += 1;
    setMapFocus({ nonce: focusCounter.current, geojsons, maxZoom });
  }, []);

  const persisted = useMemo(() => loadInvestigationData(id), [id]);

  const spillId = spill?.spill_id || persisted?.upload?.spill_id || id;

  /* ----------------------------- load scene ---------------------------- */

  const loadScene = useCallback(async (sceneId) => {
    if (!sceneId) return;

    setAisTracksGeojson(null);
    setSelectedAisTrack(null);
    setCandidateRun(null);
    setSelectedCandidateId(null);
    patchInvestigationData(id, {
      sceneId,
      ais: null,
      candidateRun: null,
      selectedCandidateId: null,
    });

    setSceneLoading(true);
    setCompatibilityLoading(true);
    setSceneError(null);

    try {
      const response = await getSceneManifest(sceneId);
      setScene(response?.scene || null);
      setManifest(response?.manifest || null);

      try {
        const compat = await getSceneCompatibility(sceneId);
        setCompatibility(normalizeCompatibility(compat?.compatibility));
      } catch (compatError) {
        setCompatibility(null);
        console.warn("Scene compatibility request failed:", getApiError(compatError).message);
      }
    } catch (err) {
      setSceneError(getApiError(err).message);
      setScene(null);
      setManifest(null);
      setCompatibility(null);
    } finally {
      setSceneLoading(false);
      setCompatibilityLoading(false);
    }
  }, [id]);

  /* ------------------------------- boot -------------------------------- */

  useEffect(() => {
    let active = true;

    async function boot() {
      const saved = loadInvestigationData(id);

      // Restore whatever this browser session already produced for this
      // investigation (real backend responses cached in sessionStorage).
      if (saved && active) {
        if (saved.detection) {
          const normalized = normalizeDetectionJob(saved.detection);
          setDetection(normalized);
          if (normalized.geojson) setSlickGeojson(normalized.geojson);
        }
        if (saved.hindcast) setHindcastResult(saved.hindcast);
        if (saved.forecast) setForecastResult(saved.forecast);
        if (saved.ais) setAisTracksGeojson(saved.ais);
        if (saved.candidateRun) {
          setCandidateRun(saved.candidateRun);
          setSelectedCandidateId(
            saved.selectedCandidateId ||
              saved.candidateRun.candidates?.[0]?.candidate_id ||
              null
          );
        }
      }

      // Spill record: failure is non-fatal (direct URLs must still work).
      try {
        const spillResponse = await getSpill(id);
        if (!active) return;
        setSpill(spillResponse);

        if (!saved?.detection && spillResponse?.geometry) {
          const hydrated = normalizeDetectionJob({
            spill_id: spillResponse.spill_id,
            status: spillResponse.status,
            message: spillResponse.message || "Detection completed.",
            geometry: spillResponse.geometry,
            area_sq_km: spillResponse.area_sq_km,
            detected_at: spillResponse.detected_at,
            detector_name: spillResponse.detector_name,
          });
          setDetection(hydrated);
          if (hydrated.geojson) setSlickGeojson(hydrated.geojson);
        }
      } catch (err) {
        if (!active) return;
        setSpillError(getApiError(err).message);
      }

      // Scene: prefer a saved scene, then a scene matching the id, then the first.
      try {
        const sceneListResponse = await getScenes();
        if (!active) return;

        const sceneList = sceneListResponse?.scenes || [];
        setScenes(sceneList);

        const targetSceneId =
          saved?.sceneId ||
          sceneList.find((item) => item.scene_id === id)?.scene_id ||
          sceneList[0]?.scene_id ||
          null;

        if (targetSceneId) {
          await loadScene(targetSceneId);
        } else {
          setSceneLoading(false);
          setCompatibilityLoading(false);
          setSceneError("No SAR scene metadata is available for this investigation.");
        }
      } catch (err) {
        if (!active) return;
        setSceneError(getApiError(err).message);
        setSceneLoading(false);
        setCompatibilityLoading(false);
      }
    }

    boot();

    return () => {
      active = false;
    };
  }, [id, loadScene]);

  /* ------------------------------ detection ---------------------------- */

  const runDetection = async () => {
    if (!spillId) {
      setDetectionError("No spill_id is available for this investigation yet.");
      return;
    }

    setDetectionLoading(true);
    setDetectionError(null);

    try {
      const job = await detectSpill(spillId);
      const normalizedJob = normalizeDetectionJob(job);

      setDetection(normalizedJob);
      if (normalizedJob.geojson) setSlickGeojson(normalizedJob.geojson);
      setLayers((prev) => ({ ...prev, slick: true }));

      patchInvestigationData(id, { detection: job });
    } catch (err) {
      const apiErr = getApiError(err);
      setDetectionError(apiErr.message);
      setDetection(
        normalizeDetectionJob({
          spill_id: spillId,
          status: "detection_failed",
          message: apiErr.message,
          error: apiErr.code ? { code: apiErr.code, message: apiErr.message } : null,
        })
      );
    } finally {
      setDetectionLoading(false);
    }
  };

  /* -------------------------------- drift ------------------------------ */

  const hasSlick = featureCount(slickGeojson) > 0;

  const runDriftAction = async (direction, params) => {
    const isHindcast = direction === "hindcast";
    const setLoading = isHindcast ? setHindcastLoading : setForecastLoading;
    const setResult = isHindcast ? setHindcastResult : setForecastResult;
    const setError = isHindcast ? setHindcastError : setForecastError;
    const runner = isHindcast ? runHindcast : runForecast;

    if (!hasSlick) {
      setError("No slick geometry is available. Run detection first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await runner({
        spillId,
        acquisitionTimeUtc: scene?.acquisition_start_utc || undefined,
        slickGeojson,
        parameters: params,
      });

      setResult(result);
      patchInvestigationData(id, { [direction]: result });

      // Result â†’ map: make the new layer visible and frame it intentionally.
      setLayers((prev) => ({
        ...prev,
        [isHindcast ? "hindcastOrigin" : "forecastCorridor"]: true,
      }));
      requestFocus(
        isHindcast
          ? [slickGeojson, result.corridor, result.endpoint]
          : [slickGeojson, hindcastResult?.corridor, result.corridor, result.endpoint]
      );
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const showDriftOnMap = (direction) => {
    if (direction === "hindcast") {
      setLayers((prev) => ({ ...prev, hindcastOrigin: true }));
      requestFocus([slickGeojson, hindcastResult?.corridor, hindcastResult?.endpoint]);
    } else {
      setLayers((prev) => ({ ...prev, forecastCorridor: true }));
      requestFocus([
        slickGeojson,
        hindcastResult?.corridor,
        forecastResult?.corridor,
        forecastResult?.endpoint,
      ]);
    }
  };

  /* --------------------------------- AIS ------------------------------- */

  const loadAis = async () => {
    if (!spillId) return;

    setAisLoading(true);
    setAisError(null);

    try {
      // start/end are REQUIRED by GET /api/v1/ais/tracks. Anchor the query on
      // the SCENE's acquisition time (AIS datasets are historical recordings).
      const centroid = detection?.metadata?.centroid;
      const isTestFixture = manifest?.data_mode === "TEST_FIXTURE";

      // TEST_FIXTURE tracks are precomputed in a synthetic window; do not
      // filter them by a live detection centroid.
      const scenarioId = isTestFixture
        ? manifest?.scenario_id || scene?.scene_id
        : undefined;

      const response = await getAisTracks(spillId, {
        startTime: scene?.acquisition_start_utc || undefined,
        endTime:
          scene?.acquisition_end_utc ||
          scene?.acquisition_start_utc ||
          detection?.detected_at ||
          undefined,
        lat: !isTestFixture && Array.isArray(centroid) ? centroid[1] : undefined,
        lon: !isTestFixture && Array.isArray(centroid) ? centroid[0] : undefined,
        radiusKm: !isTestFixture && Array.isArray(centroid) ? 50 : undefined,
        scenarioId,
      });

      const geo = normalizeAisResponse(response);

      if (!geo) {
        throw Object.assign(new Error("AIS endpoint returned no GeoJSON tracks."), {
          code: "AIS_EMPTY",
        });
      }

      setAisTracksGeojson(geo);
      setSelectedAisTrack(null);
      setLayers((prev) => ({ ...prev, aisTracks: true }));
      patchInvestigationData(id, { ais: geo });
      // Intentionally no camera move: the user may already be exploring.
    } catch (err) {
      setAisError(getApiError(err).message);
      setAisTracksGeojson(null);
    } finally {
      setAisLoading(false);
    }
  };

  /* ------------------------------ candidates --------------------------- */

  const selectedCandidate = useMemo(
    () =>
      candidateRun?.candidates?.find((c) => c.candidate_id === selectedCandidateId) || null,
    [candidateRun, selectedCandidateId]
  );

  const candidateTrackGeojson = useMemo(
    () => resolveCandidateTrack(selectedCandidate, aisTracksGeojson),
    [selectedCandidate, aisTracksGeojson]
  );

  const selectCandidate = useCallback(
    (candidate) => {
      if (!candidate) return;

      setSelectedCandidateId(candidate.candidate_id);
      setTimelineIndex(0);
      patchInvestigationData(id, { selectedCandidateId: candidate.candidate_id });

      const track = resolveCandidateTrack(candidate, aisTracksGeojson);
      setSelectedAisTrack(track && track.properties ? track : null);

      if (track) {
        setLayers((prev) => ({ ...prev, candidateTrack: true }));
        requestFocus([track], 14);
      }
    },
    [id, aisTracksGeojson, requestFocus]
  );

  const handleCandidateSelect = (candidateId) => {
    selectCandidate(candidateRun?.candidates?.find((c) => c.candidate_id === candidateId));
  };

  // Map - sidebar: clicking an AIS track selects its ranked candidate, if any.
  const handleAisTrackSelect = (feature) => {
    setSelectedAisTrack(feature);
    const key = trackKey(feature);
    const match = candidateRun?.candidates?.find((c) => key != null && String(c.mmsi) === key);
    if (match && match.candidate_id !== selectedCandidateId) {
      setSelectedCandidateId(match.candidate_id);
      setTimelineIndex(0);
      patchInvestigationData(id, { selectedCandidateId: match.candidate_id });
      setLayers((prev) => ({ ...prev, candidateTrack: true }));
    }
  };

  const compatibilityFailed = compatibility?.compatible === false;

  const handleRankCandidates = async () => {
    if (compatibilityFailed) {
      setCandidateError(compatibility?.reasons?.[0] || "The backend compatibility check did not pass.");
      return;
    }

    setCandidateLoading(true);
    setCandidateError(null);
    setCandidateBlockedDetails(null);

    try {
      let result = null;

      if (!result) {
        const candidateInputs = (aisTracksGeojson?.features || [])
          .map((track) => track?.properties?.candidate_input)
          .filter(Boolean);

        if (!candidateInputs.length) {
          throw Object.assign(new Error("No rankable AIS candidate records are available."), {
            code: "NO_AIS_CANDIDATES",
          });
        }

        const drift = hindcastResult || forecastResult;
        if (!drift) {
          throw new Error("Run a hindcast or forecast before ranking candidates.");
        }

        const driftEvidence = {
          run_id: drift.run_id || null,
          run_type: drift.run_type || null,
          mode:
            manifest?.data_mode === "TEST_FIXTURE"
              ? "TEST_FIXTURE"
              : drift.data_mode || "analyst_parameter_driven",
          corridor_reference: drift.corridor?.type || null,
          uncertainty_radius_m: drift.uncertainty_radius_m ?? null,
          assumptions: drift.assumptions || [],
        };

        result = await rankCandidates(spillId, {
          compatibility: {
            compatible: true,
            status: "passed",
            temporal_overlap: compatibility?.temporal_overlap ?? true,
            geographic_overlap: compatibility?.geographic_overlap ?? true,
            crs_valid: compatibility?.crs_valid ?? true,
            environmental_coverage: compatibility?.environmental_coverage ?? true,
            reasons: compatibility?.reasons || [],
          },
          driftEvidence,
          candidates: candidateInputs,
          limit: 10,
        });
      }

      setCandidateRun(result);
      patchInvestigationData(id, { candidateRun: result });

      if (result?.candidates?.length) {
        selectCandidate(result.candidates[0]);
      }
    } catch (err) {
      const apiError = getApiError(err);

      setCandidateError(
        apiError.code === "NO_AIS_CANDIDATES"
          ? "The loaded AIS tracks contain no rankable candidate records (candidate_input)."
          : apiError.message
      );
      setCandidateBlockedDetails(apiError.details || null);
    } finally {
      setCandidateLoading(false);
    }
  };

  // Optional: enrich the selected candidate with backend detail.
  useEffect(() => {
    let active = true;

    async function hydrateCandidate() {
      if (!selectedCandidate || !candidateRun?.run_id) return;
      if (!selectedCandidate.track_reference && !selectedCandidate.source_reference) return;

      setCandidateDetailLoading(true);

      try {
        const detail = await getCandidateDetail(
          spillId,
          candidateRun.run_id,
          selectedCandidate.candidate_id
        );

        if (!active || !detail) return;

        setCandidateRun((previous) =>
          previous
            ? {
                ...previous,
                candidates: previous.candidates.map((c) =>
                  c.candidate_id === detail.candidate_id ? detail : c
                ),
              }
            : previous
        );
      } catch {
        // Candidate detail is optional; the ranked result remains usable.
      } finally {
        if (active) setCandidateDetailLoading(false);
      }
    }

    hydrateCandidate();

    return () => {
      active = false;
    };
    // Only re-hydrate when the selection or run changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidateId, candidateRun?.run_id, spillId]);

  // Selecting a candidate brings its evidence into view.
  useEffect(() => {
    if (!selectedCandidateId) return undefined;
    const t = setTimeout(() => {
      panelRef.current
        ?.querySelector("#section-evidence")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
    return () => clearTimeout(t);
  }, [selectedCandidateId]);

  /* -------------------------------- report ----------------------------- */

  const exportReport = async () => {
    if (!spillId) {
      setReportError("No spill ID is available for report export.");
      return;
    }

    setReportLoading(true);
    setReportError(null);

    try {
      const payload = buildReportPayload({
        spillId,
        detection,
        slickGeojson,
        slickIsMock,
        candidateRun,
        compatibility,
        scene,
        hindcastResult,
        forecastResult,
        aisTracksGeojson,
        detectionError,
      });

      let report = null;
      let html = null;

      // Prefer the backend report generator so the exported document remains
      // the backend's source of truth. If the HTML renderer is unavailable,
      // fall back to a complete client-generated report rather than leaving
      // the button apparently dead.
      try {
        report = await createInvestigationReport(payload);
      } catch (reportErr) {
        console.warn("Investigation report record could not be created:", reportErr);
      }

      try {
        html = await createInvestigationReportHtml(payload);
      } catch (htmlErr) {
        console.warn("Backend HTML report unavailable; using local report renderer:", htmlErr);
      }

      if (!html || typeof html !== "string") {
        html = buildLocalInvestigationReportHtml(payload);
      }

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report?.report_id || `spilltrace-investigation-${spillId}`}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setReportError(getApiError(err).message);
    } finally {
      setReportLoading(false);
    }
  };

  /* ------------------------------ stage system ------------------------- */

  const { stages, prerequisites, next, slickCount, detectionComplete } = computeStages({
    spillId,
    detection,
    detectionLoading,
    detectionError,
    slickGeojson,
    hindcast: { loading: hindcastLoading, result: hindcastResult, error: hindcastError },
    forecast: { loading: forecastLoading, result: forecastResult, error: forecastError },
    ais: { loading: aisLoading, loaded: !!aisTracksGeojson, error: aisError },
    ranking: { loading: candidateLoading, run: candidateRun, error: candidateError },
    compatibility,
    compatibilityLoading,
    selectedCandidate,
  });

  const goToStage = (stageKey) => {
    const target = SECTION_FOR_STAGE[stageKey];
    panelRef.current
      ?.querySelector(`#section-${target}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* --------------------------- derived map data ------------------------ */

  const bounds = scene?.bounds || manifest?.bounds || null;
  const hindcastCorridor = hindcastResult?.corridor || null;
  const forecastCorridor = forecastResult?.corridor || null;

  const positions = useMemo(
    () => getTrackPositions(candidateTrackGeojson),
    [candidateTrackGeojson]
  );
  const activePosition = positions[Math.min(timelineIndex, positions.length - 1)];
  const timelinePoint =
    activePosition && activePosition.lat != null && activePosition.lon != null
      ? [activePosition.lat, activePosition.lon]
      : null;

  const availability = {
    sarSource: !!bounds,
    slick: hasSlick,
    hindcastOrigin: !!hindcastCorridor,
    forecastCorridor: !!forecastCorridor,
    aisTracks: !!aisTracksGeojson,
    candidateTrack: !!candidateTrackGeojson,
  };

  const isVisible = (key) => availability[key] && layers[key];

  const legendVisible = {
    slick: isVisible("slick"),
    sarSource: isVisible("sarSource"),
    hindcastOrigin: isVisible("hindcastOrigin"),
    forecastCorridor: isVisible("forecastCorridor"),
    uncertainty:
      (isVisible("hindcastOrigin") && hindcastResult?.uncertainty_radius_m > 0) ||
      (isVisible("forecastCorridor") && forecastResult?.uncertainty_radius_m > 0),
    aisTracks: isVisible("aisTracks"),
    candidateTrack: isVisible("candidateTrack"),
  };

  const fitView = () =>
    requestFocus([
      isVisible("slick") && slickGeojson,
      isVisible("hindcastOrigin") && hindcastCorridor,
      isVisible("forecastCorridor") && forecastCorridor,
      isVisible("aisTracks") && aisTracksGeojson,
      isVisible("candidateTrack") && candidateTrackGeojson,
    ]);

  const geo = geometryProperties(detection);
  const title =
    spill?.filename ||
    persisted?.fileName ||
    persisted?.upload?.filename ||
    scene?.scene_id ||
    id;

  const detectionLabel =
    stages.detection.state === "complete"
      ? hasSlick
        ? "Complete"
        : "No slick detected"
      : stages.detection.state === "running"
        ? "Running"
        : stages.detection.state === "failed"
          ? "Failed"
          : "Not run";

  const notices = (
    <>
      {sceneError && (
        <div className="banner banner-warn">
          <strong>Scene metadata</strong> {sceneError}
        </div>
      )}
      {spillError && (
        <div className="banner banner-warn">
          <strong>Spill record</strong> {spillError}
        </div>
      )}
      {reportError && (
        <div className="banner banner-error">
          <strong>Report export failed</strong> {reportError}
        </div>
      )}
    </>
  );

  const driftBlockedReason =
    stages.hindcast.state === "blocked" ? stages.hindcast.reason : null;

  /* -------------------------------- render ----------------------------- */

  return (
    <div className="investigation-page">
      <InvestigationHeader
        title={title}
        spillId={spillId}
        sceneId={scene?.scene_id}
        stages={stages}
        hasSlick={hasSlick}
        detectionComplete={detectionComplete}
        next={next}
        onGo={goToStage}
        onExport={exportReport}
        exporting={reportLoading}
        notices={notices}
      />

      <InvestigationSummary
        area={geo.area_sq_km}
        detectionLabel={detectionLabel}
        source={scene?.source}
        acquisition={scene?.acquisition_start_utc}
        dataMode={manifest?.data_mode}
      />

      <div className="inv-workspace">
        <div className="inv-map">
          <div className="map-context">
            <div><span className="map-context-kicker">INVESTIGATION MAP</span><strong>Live geospatial evidence</strong></div>
            <span className="map-context-status"><i /> {hasSlick ? "Slick layer active" : "Awaiting detection"}</span>
          </div>
          <InvestigationMap
            sceneBounds={bounds}
            slickGeojson={slickGeojson}
            hindcastCorridor={hindcastCorridor}
            hindcastEndpoint={hindcastResult?.endpoint || null}
            hindcastUncertaintyM={hindcastResult?.uncertainty_radius_m}
            forecastCorridor={forecastCorridor}
            forecastEndpoint={forecastResult?.endpoint || null}
            forecastUncertaintyM={forecastResult?.uncertainty_radius_m}
            aisTracksGeojson={aisTracksGeojson}
            candidateTrackGeojson={candidateTrackGeojson}
            candidateMmsi={selectedCandidate?.mmsi}
            selectedAisKey={trackKey(selectedAisTrack)}
            timelinePoint={timelinePoint}
            layers={layers}
            basemap={basemap}
            focus={mapFocus}
            onAisTrackSelect={handleAisTrackSelect}
          />

          <MapLegend visible={legendVisible} />

          <MapLayers
            layers={layers}
            availability={availability}
            onToggle={toggleLayer}
            basemap={basemap}
            onBasemap={setBasemap}
            onFit={fitView}
          />
        </div>

        <aside className="inv-panel" ref={panelRef} aria-label="Analysis panel">
          <CompatibilityStatus
            compatibility={compatibility}
            loading={compatibilityLoading}
          />

          <DetectionCard
            stage={stages.detection}
            detection={detection}
            slickCount={slickCount}
            canRun={!!spillId && !spillError}
            error={detectionError}
            onRun={runDetection}
            onShowOnMap={() => requestFocus([slickGeojson], 13)}
          />

          <DriftPanel
            hindcastStage={stages.hindcast}
            forecastStage={stages.forecast}
            hindcastResult={hindcastResult}
            forecastResult={forecastResult}
            hindcastLoading={hindcastLoading}
            forecastLoading={forecastLoading}
            hindcastError={hindcastError}
            forecastError={forecastError}
            blockedReason={driftBlockedReason}
            layers={layers}
            onRun={runDriftAction}
            onShow={showDriftOnMap}
            onToggleLayer={toggleLayer}
          />

          <AisPanel
            stage={stages.ais}
            tracks={aisTracksGeojson}
            loading={aisLoading}
            error={aisError}
            compatibility={compatibility}
            selectedTrack={selectedAisTrack}
            onLoad={loadAis}
            onShowOnMap={() => {
              setLayers((prev) => ({ ...prev, aisTracks: true }));
              requestFocus([aisTracksGeojson]);
            }}
            rankingReady={stages.ranking.state === "ready"}
            onGoToRanking={() => goToStage("ranking")}
          />

          <CandidatePanel
            stage={stages.ranking}
            prerequisites={prerequisites}
            run={candidateRun}
            loading={candidateLoading}
            error={candidateError}
            errorDetails={candidateBlockedDetails}
            aisTracks={aisTracksGeojson}
            selectedCandidateId={selectedCandidateId}
            onRank={handleRankCandidates}
            onSelect={handleCandidateSelect}
          />

          {selectedCandidate && (
            <Section id="evidence" title="EVIDENCE" state={stages.evidence.state}>
              <EvidenceDrawer candidate={selectedCandidate} loading={candidateDetailLoading} />

              <div className="subsection">
                <span className="label">TRACK TIMELINE</span>
                <AISTimeline
                  positions={positions}
                  selectedIndex={timelineIndex}
                  onChange={setTimelineIndex}
                />
              </div>
            </Section>
          )}

          <SceneMetadata
            scene={scene}
            manifest={manifest}
            loading={sceneLoading}
            scenes={scenes}
            onSelectScene={loadScene}
          />

          <div className="disclaimer">
            <strong>Investigation support only</strong>
            <span>
              {candidateRun?.disclaimer ||
                "Candidate rankings support investigation and do not constitute legal attribution."}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
