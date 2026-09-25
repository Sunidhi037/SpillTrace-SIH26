import Section from "../ui/Section";
import { ErrorNotice, KV, LoadingNotice, SuccessLine } from "../ui/Feedback";
import { NA, formatKm2, formatLatLon, formatUtc } from "../../utils/format";
import { resolveApiUrl } from "../../services/api";

/**
 * Detection summary. Shows only what the backend returned; anything absent
 * is rendered as "Not available" (the detect endpoint returns no confidence
 * score, so none is ever displayed).
 */
export default function DetectionCard({
  stage,
  detection,
  slickCount,
  canRun,
  error,
  onRun,
  onShowOnMap,
}) {
  const state = stage?.state;
  const metadata = detection?.metadata || {};
  const centroid =
    Array.isArray(metadata.centroid) && metadata.centroid.length === 2
      ? metadata.centroid
      : null;
  const area = metadata.extra?.area_sq_km ?? metadata.area_sq_km ?? null;
  const confidence =
    metadata.extra?.confidence ?? metadata.confidence ?? metadata.mean_probability ?? null;

  const artifacts = detection?.artifacts
    ? Object.entries(detection.artifacts)
        .map(([key, value]) => [key, resolveApiUrl(value)])
        .filter(([, url]) => url)
    : [];

  return (
    <Section id="detection" title="DETECTION" state={state}>
      {state === "running" && (
        <LoadingNotice
          title="Running spill detection…"
          lines={["Analyzing SAR scene", "Extracting potential slick geometry"]}
        />
      )}

      {state === "failed" && (
        <ErrorNotice
          title="DETECTION FAILED"
          message="The SAR scene could not be processed."
          reason={error || detection?.message}
          onRetry={canRun ? onRun : undefined}
        />
      )}

      {state === "blocked" && <p className="muted">{stage.reason}</p>}

      {state === "ready" && (
        <>
          <p className="muted">
            No detection result is available for this investigation yet.
          </p>
          <button type="button" className="btn btn-primary" onClick={onRun}>
            RUN SPILL DETECTION
          </button>
        </>
      )}

      {state === "complete" && (
        <>
          {slickCount > 0 ? (
            <SuccessLine>Potential slick detected</SuccessLine>
          ) : (
            <div className="notice notice-warn">
              <strong>No slick above threshold</strong>
              <p>{detection?.message || "The detector found no slick geometry in this scene."}</p>
            </div>
          )}

          <div className="kv-grid">
            <KV label="Area" value={formatKm2(area)} />
            <KV label="Confidence" value={confidence != null ? String(confidence) : NA} />
            <KV label="Centroid (lat, lon)" value={formatLatLon(centroid)} mono />
            <KV label="Slick polygons" value={slickCount} />
            <KV label="Detected at" value={formatUtc(detection?.detected_at)} wide />
            {metadata.detector_name && <KV label="Detector" value={metadata.detector_name} wide />}
          </div>

          <div className="btn-row">
            {slickCount > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onShowOnMap}>
                SHOW DETECTION ON MAP
              </button>
            )}
            {canRun && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRun}>
                Re-run detection
              </button>
            )}
          </div>

          {artifacts.length > 0 && (
            <div className="artifact-list">
              {artifacts.map(([key, url]) => (
                <a key={key} href={url} target="_blank" rel="noreferrer">
                  {key.replaceAll("_", " ")}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
