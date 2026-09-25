import Section from "../ui/Section";
import { ErrorNotice, KV, LoadingNotice, SuccessLine } from "../ui/Feedback";
import AISTrackInfo from "./AISTrackInfo";
import { featureCount } from "../../utils/investigation";

const yesNo = (v) => (v === true ? "✓ Yes" : v === false ? "✗ No" : "Not reported");

export default function AisPanel({
  stage,
  tracks,
  loading,
  error,
  compatibility,
  selectedTrack,
  onLoad,
  onShowOnMap,
  onGoToRanking,
  rankingReady,
}) {
  const state = stage.state;
  const count = featureCount(tracks);
  const features = tracks?.features || [];
  const rankable = features.filter((f) => f?.properties?.candidate_input).length;
  const synthetic = features.some((f) => f?.properties?.is_synthetic);

  return (
    <Section id="ais" title="AIS TRACK ANALYSIS" state={state}>
      {state === "blocked" && (
        <>
          <p className="muted">Status: Not loaded</p>
          <p className="prereq-note">{stage.reason}</p>
        </>
      )}

      {(state === "ready" || (state === "failed" && !loading)) && (
        <>
          {state === "ready" && (
            <>
              <p className="muted">Status: Not loaded</p>
              <p className="muted">AIS tracks are required before candidate ranking.</p>
            </>
          )}
          {state === "failed" && (
            <ErrorNotice
              title="AIS LOADING FAILED"
              message="AIS tracks could not be retrieved for this investigation."
              reason={error}
              onRetry={onLoad}
            />
          )}
          {state === "ready" && (
            <>
              <button type="button" className="btn btn-primary" onClick={onLoad}>
                LOAD AIS TRACKS
              </button>
              <small className="hint">Loads vessel tracks within the investigation time and spatial window.</small>
            </>
          )}
        </>
      )}

      {state === "running" && (
        <LoadingNotice
          title="LOADING AIS TRACKS…"
          lines={["Retrieving vessel tracks", "Filtering investigation window", "Preparing map layer"]}
        />
      )}

      {state === "complete" && (
        <>
          <SuccessLine>
            {count} AIS {count === 1 ? "track" : "tracks"} loaded
          </SuccessLine>

          {synthetic && (
            <div className="badge badge-amber">SYNTHETIC DEMONSTRATION TRACKS</div>
          )}

          <div className="kv-grid">
            <KV label="Tracks with ranking inputs" value={rankable} />
            <KV label="Temporal overlap" value={yesNo(compatibility?.temporal_overlap)} />
            <KV label="Spatial coverage" value={yesNo(compatibility?.geographic_overlap)} />
          </div>
          <p className="footnote">Overlap flags are scene-level compatibility results from the backend.</p>

          {count > 0 && rankable === 0 && (
            <div className="notice notice-warn">
              <p>
                None of these tracks carry candidate scoring inputs, so the backend may be unable
                to rank them.
              </p>
            </div>
          )}
          {count === 0 && (
            <div className="notice notice-warn">
              <p>The AIS query returned no tracks for this window.</p>
            </div>
          )}

          <div className="btn-row">
            {count > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onShowOnMap}>
                VIEW ON MAP
              </button>
            )}
            {rankingReady && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onGoToRanking}>
                Continue to ranking ↓
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLoad}>
              Reload
            </button>
          </div>

          {selectedTrack ? (
            <AISTrackInfo track={selectedTrack} />
          ) : (
            count > 0 && <p className="hint">Click a track on the map for vessel details.</p>
          )}
        </>
      )}
    </Section>
  );
}
