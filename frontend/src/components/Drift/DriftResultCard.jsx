import { KV, SuccessLine } from "../ui/Feedback";
import { NA, formatLatLon, formatUtc, shortId } from "../../utils/format";
import { getGeoJSONCentroid } from "../../utils/investigation";
import { MAP_COLORS } from "../../utils/mapStyles";

/**
 * Result of one backend drift run. Every value is read from the DriftResponse
 * (app/schemas/drift.py). The backend returns an uncertainty radius but no
 * confidence percentage, so none is shown.
 */
export default function DriftResultCard({ kind, result, layerVisible, onShow, onToggleLayer }) {
  if (!result) return null;

  const isHindcast = kind === "hindcast";
  const color = isHindcast ? MAP_COLORS.hindcast : MAP_COLORS.forecast;
  const point = result.endpoint ? getGeoJSONCentroid(result.endpoint) : null;
  const hasCorridor = !!result.corridor;

  return (
    <div className="result-card" style={{ "--accent": color }}>
      <div className="result-card-head">
        <span className="dot" />
        <strong>{isHindcast ? "HINDCAST" : "FORECAST"}</strong>
        <span className="result-card-state">✓ COMPLETE</span>
      </div>

      <SuccessLine>
        {isHindcast ? "Origin reconstructed" : "Future movement simulated"}
      </SuccessLine>

      <div className="kv-grid">
        <KV
          label={isHindcast ? "Origin estimate (lat, lon)" : "Forecast endpoint (lat, lon)"}
          value={formatLatLon(point)}
          mono
          wide
        />
        <KV
          label={isHindcast ? "Reconstruction" : "Duration"}
          value={result.duration_hours != null ? `${result.duration_hours} hours` : NA}
        />
        <KV
          label="Uncertainty radius"
          value={result.uncertainty_radius_m != null ? `${Math.round(result.uncertainty_radius_m)} m` : NA}
        />
        <KV
          label="Time window"
          value={`${formatUtc(result.start_time_utc, { withYear: false })} → ${formatUtc(result.end_time_utc, { withYear: false })}`}
          wide
        />
        <KV label="Data mode" value={result.data_mode_label || result.data_mode || NA} wide />
        <KV label="Run" value={shortId(result.run_id, 12) || NA} mono />
        <KV label="Particles" value={result.particle_count ?? NA} />
      </div>

      {Array.isArray(result.assumptions) && result.assumptions.length > 0 && (
        <details className="assumptions">
          <summary>Assumptions ({result.assumptions.length})</summary>
          <ul>
            {result.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      {hasCorridor && (
        <div className="result-card-foot">
          <span className={layerVisible ? "map-status on" : "map-status off"}>
            {layerVisible
              ? `✓ ${isHindcast ? "Origin corridor" : "Forecast corridor"} added to map`
              : "Layer hidden on map"}
          </span>
          <div className="btn-row">
            {!layerVisible && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleLayer}>
                Show layer
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onShow}>
              VIEW ON MAP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
