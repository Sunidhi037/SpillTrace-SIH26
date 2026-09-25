import { NA, formatUtc } from "../../utils/format";

/**
 * Scrubs through the selected candidate's real AIS position history.
 * positions[i] is one backend-reported fix; the slider only snaps to real
 * indices (no interpolation) and the same fix is marked on the map.
 */
function AISTimeline({ positions, selectedIndex, onChange }) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return <p className="muted">No AIS position history is available for this candidate.</p>;
  }

  const idx = Math.min(selectedIndex, positions.length - 1);
  const cur = positions[idx];
  const first = positions[0];
  const last = positions[positions.length - 1];

  return (
    <div className="timeline">
      <div className="timeline-current">
        <strong>{formatUtc(cur.timestamp)}</strong>
        <small>
          {cur.lat != null && cur.lon != null
            ? `${Number(cur.lat).toFixed(4)}, ${Number(cur.lon).toFixed(4)}`
            : NA}
          {cur.sog != null ? ` · ${cur.sog} kn` : ""}
          {cur.cog != null ? ` · COG ${cur.cog}°` : ""}
        </small>
      </div>

      <input
        type="range"
        className="timeline-slider"
        min={0}
        max={positions.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="AIS position history"
      />

      <div className="timeline-ends">
        <span>{formatUtc(first.timestamp, { withYear: false })}</span>
        <span>
          {idx + 1} / {positions.length}
        </span>
        <span>{formatUtc(last.timestamp, { withYear: false })}</span>
      </div>
      <p className="hint">Selected position is marked on the map.</p>
    </div>
  );
}

export default AISTimeline;
