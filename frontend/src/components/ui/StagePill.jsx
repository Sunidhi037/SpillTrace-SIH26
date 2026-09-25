const LABELS = {
  blocked: "BLOCKED",
  ready: "READY",
  running: "RUNNING",
  complete: "COMPLETE",
  failed: "FAILED",
};

export default function StagePill({ state, label }) {
  if (!state) return null;
  return (
    <span className={`stage-pill stage-pill-${state}`}>
      {state === "running" && <span className="spinner spinner-xs" aria-hidden="true" />}
      {label || LABELS[state] || state}
    </span>
  );
}
