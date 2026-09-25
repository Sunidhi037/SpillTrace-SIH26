import { KV } from "../ui/Feedback";
import { NA } from "../../utils/format";

/**
 * Details for the AIS track selected on the map. Everything comes from the
 * feature the backend returned (properties.mmsi, vessel_name, positions,
 * quality); nothing is inferred.
 */
function AISTrackInfo({ track }) {
  if (!track) return null;

  const p = track.properties || {};
  const provenance = p.quality?.source_file_provenance || null;
  const positions = Array.isArray(p.positions) ? p.positions.length : null;
  const verifiedReal = provenance != null && provenance.startsWith("real ");

  return (
    <div className="track-info">
      <div className="track-info-head">
        <strong>{p.vessel_name || "Unknown vessel"}</strong>
        {p.is_synthetic && <span className="badge badge-amber">SYNTHETIC</span>}
      </div>

      <div className="kv-grid">
        <KV label="MMSI" value={p.mmsi || NA} mono />
        <KV label="Positions" value={positions ?? NA} />
        <KV label="Track continuity" value={p.quality?.track_continuity ?? NA} wide />
      </div>

      <div className={`provenance ${verifiedReal ? "real" : "unverified"}`}>
        {provenance || "Data source not labelled by backend — treat as unverified."}
      </div>
    </div>
  );
}

export default AISTrackInfo;
