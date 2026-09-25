import { featureCount } from "./investigation";

/**
 * Derives the guided-workflow state of every analysis stage from the
 * investigation's real state. Nothing here calls the backend.
 *
 * stage.state: "blocked" | "ready" | "running" | "complete" | "failed"
 */
export const STAGE_ORDER = ["detection", "hindcast", "forecast", "ais", "ranking"];

export const STAGE_LABEL = {
  detection: "Detect",
  hindcast: "Hindcast",
  forecast: "Forecast",
  ais: "AIS",
  ranking: "Rank",
};

export function computeStages({
  spillId,
  detection,
  detectionLoading,
  detectionError,
  slickGeojson,
  hindcast,
  forecast,
  ais,
  ranking,
  compatibility,
  compatibilityLoading,
  selectedCandidate,
}) {
  const slickCount = featureCount(slickGeojson);
  const hasSlick = slickCount > 0;
  const detectionComplete = detection?.status === "COMPLETED";

  const noSlickReason = detectionComplete
    ? "No slick geometry was detected in this scene."
    : "Run detection first.";

  /* Detection */
  let detectionState;
  let detectionReason = null;
  if (detectionLoading) detectionState = "running";
  else if (detection?.status === "FAILED" || (detectionError && !detectionComplete))
    detectionState = "failed";
  else if (detectionComplete) detectionState = "complete";
  else if (!spillId) {
    detectionState = "blocked";
    detectionReason = "No spill record is available for this investigation.";
  } else detectionState = "ready";

  /* Drift (hindcast / forecast) */
  const drift = (d) => {
    if (d.loading) return { state: "running", reason: null };
    if (d.result) return { state: "complete", reason: null };
    if (d.error) return { state: "failed", reason: d.error };
    if (!hasSlick) return { state: "blocked", reason: noSlickReason };
    return { state: "ready", reason: null };
  };

  /* AIS */
  let aisStage;
  if (ais.loading) aisStage = { state: "running", reason: null };
  else if (ais.loaded) aisStage = { state: "complete", reason: null };
  else if (ais.error) aisStage = { state: "failed", reason: ais.error };
  else if (!hasSlick) aisStage = { state: "blocked", reason: noSlickReason };
  else aisStage = { state: "ready", reason: null };

  /* Ranking prerequisites */
  const driftDone = !!(hindcast.result || forecast.result);
  // Compatibility is useful evidence, but an unavailable compatibility
  // response should not make the ranking action impossible. An explicit
  // backend incompatibility still blocks ranking.
  const compatibilityFailed = compatibility?.compatible === false;
  const compatibilityAvailable = compatibility?.compatible === true;

  const prerequisites = [
    {
      key: "ais",
      ok: ais.loaded,
      label: "AIS tracks loaded",
      hint: "Load AIS tracks first.",
    },
    {
      key: "drift",
      ok: driftDone,
      label: "Drift reconstruction available",
      hint: "Run a hindcast or forecast first.",
    },
    {
      key: "compat",
      ok: !compatibilityFailed,
      label: compatibilityAvailable ? "Data compatibility passed" : "Compatibility check",
      hint: compatibilityFailed
        ? compatibility?.reasons?.[0] || "The backend compatibility check did not pass."
        : compatibilityAvailable
          ? "Backend compatibility check passed."
          : compatibilityLoading
            ? "Compatibility check is still running; ranking can use the available evidence."
            : "Compatibility data is not available; ranking can still be attempted with AIS and drift evidence.",
    },
  ];
  const unmet = prerequisites.filter((p) => !p.ok);

  let rankingStage;
  if (ranking.loading) rankingStage = { state: "running", reason: null };
  else if (ranking.run && !ranking.error)
    rankingStage = { state: "complete", reason: null };
  else if (ranking.error) rankingStage = { state: "failed", reason: ranking.error };
  else if (unmet.length)
    rankingStage = { state: "blocked", reason: unmet.map((u) => u.hint).join(" ") };
  else rankingStage = { state: "ready", reason: null };

  const stages = {
    detection: { state: detectionState, reason: detectionReason },
    hindcast: drift(hindcast),
    forecast: drift(forecast),
    ais: aisStage,
    ranking: rankingStage,
    evidence: selectedCandidate
      ? { state: "complete", reason: null }
      : rankingStage.state === "complete"
        ? { state: "ready", reason: null }
        : { state: "blocked", reason: "Rank candidates first." },
  };

  /* Guided next action */
  let next = null;
  if (stages.detection.state === "ready")
    next = { stage: "detection", section: "detection", text: "Run spill detection on the uploaded SAR scene." };
  else if (stages.detection.state === "failed")
    next = { stage: "detection", section: "detection", text: "Detection failed — review the error and try again." };
  else if (!hasSlick && detectionComplete)
    next = { stage: "detection", section: "detection", text: "No slick was detected, so drift analysis is unavailable." };
  else if (stages.hindcast.state === "ready")
    next = { stage: "hindcast", section: "drift", text: "Run hindcast to reconstruct the probable origin." };
  else if (stages.forecast.state === "ready" && stages.ais.state !== "complete")
    next = { stage: "forecast", section: "drift", text: "Run forecast to simulate future movement (optional for ranking)." };
  else if (stages.ais.state === "ready")
    next = { stage: "ais", section: "ais", text: "Load AIS tracks for the investigation window." };
  else if (stages.ranking.state === "ready")
    next = { stage: "ranking", section: "candidates", text: "Rank candidate vessels against the available evidence." };
  else if (stages.ranking.state === "complete" && !selectedCandidate)
    next = { stage: "evidence", section: "candidates", text: "Select a candidate to view its track, evidence and timeline." };
  else if (stages.ranking.state === "blocked" && stages.ais.state === "complete" && driftDone)
    next = { stage: "ranking", section: "candidates", text: "Candidate ranking is blocked — see the reason in the Candidates section." };

  return { stages, prerequisites, unmet, hasSlick, slickCount, detectionComplete, next };
}
