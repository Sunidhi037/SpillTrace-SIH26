import { useState } from "react";
import { BASEMAPS, MAP_COLORS } from "../../utils/mapStyles";

const LAYER_DEFS = [
  { key: "slick", label: "Observed slick", short: "Slick", color: MAP_COLORS.slick, tone: "slick", kind: "area" },
  { key: "hindcastOrigin", label: "Hindcast origin", short: "Hindcast", color: MAP_COLORS.hindcast, tone: "hindcast", kind: "line" },
  { key: "forecastCorridor", label: "Forecast corridor", short: "Forecast", color: MAP_COLORS.forecast, tone: "forecast", kind: "line" },
  { key: "aisTracks", label: "AIS vessel tracks", short: "AIS", color: MAP_COLORS.ais, tone: "ais", kind: "line" },
  { key: "candidateTrack", label: "Selected candidate", short: "Candidate", color: MAP_COLORS.candidate, tone: "candidate", kind: "line" },
  { key: "sarSource", label: "SAR scene extent", short: "SAR extent", color: MAP_COLORS.extent, tone: "extent", kind: "outline" },
];

function MapLayers({ layers, onToggle, availability, basemap, onBasemap, onFit }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`map-layers ${open ? "is-open" : "is-collapsed"}`}>
      <button
        type="button"
        className="map-layers-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="map-layer-panel"
      >
        <span className="map-layers-title">
          <span className="map-control-icon" aria-hidden="true">◈</span>
          <span>MAP LAYERS</span>
        </span>
        <span className="map-layers-count">
          {LAYER_DEFS.filter(({ key }) => layers[key] && availability?.[key] !== false).length}
          <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
        </span>
      </button>

      {open && (
        <div className="map-layers-body" id="map-layer-panel">
          <div className="map-layers-caption">Visibility</div>

          <div className="map-layer-list">
            {LAYER_DEFS.map(({ key, label, color, tone, kind }) => {
              const available = availability?.[key] !== false;
              const checked = !!layers[key] && available;

              return (
                <label
                  key={key}
                  className={`map-layer-toggle ${checked ? "active" : ""} ${!available ? "disabled" : ""}`}
                  title={available ? label : "No data for this layer yet"}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!available}
                    onChange={() => onToggle(key)}
                  />
                  <span
                    className={`layer-symbol layer-symbol-${tone} layer-symbol-${kind}`}
                    style={{ "--layer-color": color }}
                    aria-hidden="true"
                  />
                  <span className="map-layer-copy">
                    <span className="map-layer-label">{label}</span>
                    {!available && <span className="map-layer-state">Not available</span>}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="map-layers-foot">
            <div className="map-layers-caption">Base map</div>
            <div className="segmented" role="group" aria-label="Basemap">
              {Object.entries(BASEMAPS).map(([id, b]) => (
                <button
                  key={id}
                  type="button"
                  className={basemap === id ? "active" : ""}
                  onClick={() => onBasemap(id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <button type="button" className="map-fit-button" onClick={onFit}>
              <span aria-hidden="true">⌖</span>
              Fit investigation view
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapLayers;
