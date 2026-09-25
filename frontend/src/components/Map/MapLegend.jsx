import { MAP_COLORS, MAP_DASH } from "../../utils/mapStyles";

/**
 * Legend entries appear only for layers that are actually drawn, and use the
 * same colour constants as the Leaflet layers.
 */
function MapLegend({ visible }) {
  const items = [
    { key: "slick", label: "Observed slick", color: MAP_COLORS.slick, kind: "fill" },
    { key: "sarSource", label: "SAR extent", color: MAP_COLORS.extent, kind: "line" },
    { key: "hindcastOrigin", label: "Hindcast origin", color: MAP_COLORS.hindcast, kind: "dash", dash: MAP_DASH.hindcast },
    { key: "forecastCorridor", label: "Forecast corridor", color: MAP_COLORS.forecast, kind: "dash", dash: MAP_DASH.forecast },
    { key: "uncertainty", label: "Uncertainty radius", color: MAP_COLORS.uncertainty, kind: "dash", dash: MAP_DASH.uncertainty },
    { key: "aisTracks", label: "AIS track", color: MAP_COLORS.ais, kind: "line" },
    { key: "candidateTrack", label: "Selected candidate", color: MAP_COLORS.candidate, kind: "thick" },
  ].filter((item) => visible[item.key]);

  if (!items.length) return null;

  return (
    <div className="map-legend" aria-label="Map legend">
      <div className="map-legend-title">MAP LAYERS</div>
      {items.map((item) => (
        <div className="legend-item" key={item.key}>
          <span
            className={`legend-glyph legend-${item.kind}`}
            style={{
              "--c": item.color,
              borderTopStyle: item.kind === "dash" ? "dashed" : "solid",
            }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default MapLegend;
