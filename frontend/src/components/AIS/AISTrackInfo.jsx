/**
 * AISTrackInfo
 *
 * Shown when an AIS track is selected on the map. GET /api/v1/ais/tracks
 * (app/services/ais_service.py) now returns real feature data -- either
 * from data/ais/*.json if present, or a clearly-labeled synthetic demo
 * dataset otherwise (properties.quality.source_file_provenance says which).
 * This still renders the "no track selected" state gracefully if the
 * caller passes no track (e.g. before "Load AIS Tracks" has been run, or
 * if the query returned zero features).
 */

function AISTrackInfo({ track, compatibilityBlocked, blockedReason }) {
  if (compatibilityBlocked) {
    return (
      <div className="ais-track-info ais-blocked">
        <strong>Vessel attribution unavailable</strong>
        <p>{blockedReason || "Compatibility check did not pass for this investigation."}</p>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="ais-track-info ais-empty">
        <strong>AIS tracks not available</strong>
        <p>
          No AIS track is selected yet. Click "Load AIS Tracks" and pick a
          track on the map — no vessel positions, MMSIs, or timestamps are
          fabricated in this panel beyond whatever the backend actually
          returned.
        </p>
      </div>
    );
  }

  const p = track.properties || {};

  // properties.quality.source_file_provenance is set by the backend
  // (app/services/ais_service.py) on every feature it returns. It always
  // starts with "real (Pratyush AIS ETL, cleaned parquet): <path>" for
  // genuine data. There is currently no synthetic path left in the
  // backend service at all -- but this check is kept defensive (rather
  // than just trusting a "real" label) so that if a future data source is
  // ever added upstream without updating this string, an unrecognized
  // provenance value still renders as a visible warning instead of
  // silently looking identical to verified real data.
  const provenance = p.quality?.source_file_provenance || null;
  const isVerifiedReal = provenance != null && provenance.startsWith("real ");

  return (
    <div className="ais-track-info">
      <strong>{p.vessel_name || "Unknown vessel"}</strong>

      <div
        className={`ais-provenance-badge ${
          isVerifiedReal ? "ais-provenance-real" : "ais-provenance-unverified"
        }`}
      >
        {provenance
          ? provenance
          : "Data source not labeled by backend — treat as unverified."}
      </div>

      <div className="quality-row">
        <span>MMSI</span>
        <span>{p.mmsi || "Not provided by backend"}</span>
      </div>
      <div className="quality-row">
        <span>Type</span>
        <span>{p.vessel_type || "Not provided by backend"}</span>
      </div>
      <div className="quality-row">
        <span>Speed</span>
        <span>{p.speed_knots != null ? `${p.speed_knots} kn` : "Not provided by backend"}</span>
      </div>
      <div className="quality-row">
        <span>Course</span>
        <span>{p.course_degrees != null ? `${p.course_degrees}°` : "Not provided by backend"}</span>
      </div>
      <div className="quality-row">
        <span>Data Quality</span>
        <span>{p.data_quality_status || "Not provided by backend"}</span>
      </div>
    </div>
  );
}

export default AISTrackInfo;
