import { useState } from "react";

/**
 * Drift inputs + the two actions. Parameters are analyst-supplied (the
 * backend schema requires them); the defaults below mirror the backend's own
 * defaults and are not measured data. Fully controlled by DriftPanel.
 */

const FIELDS = [
  ["wind_speed_mps", "Wind speed (m/s)", { min: 0, step: 0.1 }],
  ["wind_direction_from_deg", "Wind from (°)", { min: 0, max: 359 }],
  ["current_speed_mps", "Current speed (m/s)", { min: 0, step: 0.1 }],
  ["current_direction_to_deg", "Current toward (°)", { min: 0, max: 359 }],
  ["duration_hours", "Duration (h)", { min: 1, max: 720 }],
  ["timestep_minutes", "Timestep (min)", { min: 1, max: 1440 }],
];

const fmt = (v, d = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : "—");

function DriftControls({
  params,
  onChange,
  onRunHindcast,
  onRunForecast,
  hindcastLoading,
  forecastLoading,
  hindcastDone,
  forecastDone,
  blockedReason,
}) {
  const [editing, setEditing] = useState(false);
  const blocked = !!blockedReason;

  return (
    <div className="drift-controls">
      <div className="drift-summary">
        <div className="drift-summary-head">
          <span className="label">Environmental inputs</span>
          <button type="button" className="link-button" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit"}
          </button>
        </div>

        {!editing ? (
          <div className="drift-summary-grid">
            <div>
              <span className="kv-label">Wind</span>
              <strong>{fmt(params.wind_speed_mps)} m/s</strong>
              <small>from {fmt(params.wind_direction_from_deg, 0)}°</small>
            </div>
            <div>
              <span className="kv-label">Current</span>
              <strong>{fmt(params.current_speed_mps)} m/s</strong>
              <small>toward {fmt(params.current_direction_to_deg, 0)}°</small>
            </div>
            <div>
              <span className="kv-label">Simulation</span>
              <strong>{fmt(params.duration_hours, 0)} hours</strong>
              <small>{fmt(params.timestep_minutes, 0)} min timestep</small>
            </div>
          </div>
        ) : (
          <div className="drift-fields">
            {FIELDS.map(([field, label, attrs]) => (
              <label key={field} className="field">
                <span>{label}</span>
                <input
                  type="number"
                  {...attrs}
                  value={params[field]}
                  onChange={(e) => onChange(field, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        )}

        <p className="footnote">
          Analyst-supplied parameters (backend defaults shown), not measured environmental data.
        </p>
      </div>

      <div className="drift-actions">
        <div className="action">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRunHindcast}
            disabled={blocked || hindcastLoading}
          >
            {hindcastLoading ? (
              <>
                <span className="spinner spinner-xs" aria-hidden="true" /> RUNNING HINDCAST…
              </>
            ) : hindcastDone ? (
              "RE-RUN HINDCAST"
            ) : (
              "RUN HINDCAST"
            )}
          </button>
          <small>Reconstructs the probable origin region by moving backward from the detected slick.</small>
        </div>

        <div className="action">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRunForecast}
            disabled={blocked || forecastLoading}
          >
            {forecastLoading ? (
              <>
                <span className="spinner spinner-xs" aria-hidden="true" /> RUNNING FORECAST…
              </>
            ) : forecastDone ? (
              "RE-RUN FORECAST"
            ) : (
              "RUN FORECAST"
            )}
          </button>
          <small>Simulates future slick movement from the detected region.</small>
        </div>
      </div>

      {blocked && <p className="prereq-note">{blockedReason}</p>}
    </div>
  );
}

export default DriftControls;
