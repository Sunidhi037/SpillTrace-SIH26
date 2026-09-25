import InvestigationStepper from "./InvestigationStepper";

function InvestigationHeader({
  title,
  spillId,
  sceneId,
  stages,
  next,
  onGo,
  onExport,
  exporting,
  notices,
}) {
  const detection = stages.detection;
  const status = detection.state === "complete"
    ? { label: "DETECTION COMPLETE", tone: "complete" }
    : detection.state === "running"
      ? { label: "DETECTION RUNNING", tone: "running" }
      : detection.state === "failed"
        ? { label: "DETECTION FAILED", tone: "failed" }
        : { label: "INVESTIGATION IN PROGRESS", tone: "warn" };

  return (
    <header className="inv-header">
      <div className="inv-header-main">
        <div className="inv-title">
          <p className="eyebrow">SPILLTRACE / INVESTIGATION WORKSPACE</p>
          <div className="inv-title-row">
            <h1 title={title}>{title}</h1>
            <span className={`status-pill status-${status.tone}`}>
              <span className="status-dot" /> {status.label}
            </span>
          </div>
          <div className="inv-sub">
            <span className="mono">ID {spillId}</span>
            {sceneId && <><span className="sub-divider">·</span><span>Scene {sceneId}</span></>}
          </div>
        </div>

        <div className="inv-header-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGo("detection")}>
            Investigation flow
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onExport} disabled={exporting}>
            {exporting ? "Preparing report…" : "Export Investigation Report"}
          </button>
        </div>
      </div>

      <div className="inv-progress-row">
        <InvestigationStepper stages={stages} next={next} onGo={onGo} />
        {next && (
          <div className="next-action next-action-compact">
            <span className="next-label">NEXT</span>
            <span>{next.text}</span>
            <button type="button" className="link-button" onClick={() => onGo(next.stage)}>Go to step →</button>
          </div>
        )}
      </div>

      {notices}
    </header>
  );
}

export default InvestigationHeader;
