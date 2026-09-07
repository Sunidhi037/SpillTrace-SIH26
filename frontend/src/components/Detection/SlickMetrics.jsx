/**
 * SlickMetrics
 *
 * Displays whatever the backend actually returns for a detection.
 *
 * The live detect endpoint is POST /api/spills/{spill_id}/detect
 * (app/api/routes/spills.py), which returns a SpillResponse:
 *   { spill_id, status, message, geometry, area_sq_km, detected_at }
 *
 * Investigation.jsx's normalizeDetectionJob() adapts that into a
 * DetectionResponse-shaped `metadata` object so this component (and
 * DetectionStatus) can stay written against one consistent shape:
 *   metadata.extra.area_sq_km  <- real area_sq_km from the backend
 *   metadata.centroid          <- computed client-side from the geometry
 *     (the backend doesn't return one directly for this endpoint)
 *   metadata.detector_name     <- spill.detector_name if the backend sent one
 *
 * There is still no perimeter or confidence-score field anywhere on the
 * backend response, so those stay explicitly "Not provided by backend"
 * rather than being computed or guessed.
 */

function SlickMetrics({ metadata, mockArea, isMockSource }) {
  if (!metadata) {
    return (
      <div className="metric-grid">
        <div className="empty-state">No detection metadata available yet.</div>
      </div>
    );
  }

  const centroid = Array.isArray(metadata.centroid) && metadata.centroid.length === 2 ? metadata.centroid : null;

  const areaSqKm =
    metadata.extra?.area_sq_km ??
    metadata.area_sq_km ??
    (isMockSource ? mockArea : null) ??
    null;

  return (
    <div className="metric-grid">
      <div>
        <span>Detector</span>
        <strong>{metadata.detector_name || "Not provided by backend"}</strong>
      </div>

      <div>
        <span>Model</span>
        <strong>{metadata.model_name || "Not provided by backend"}</strong>
      </div>

      <div>
        <span>Slick Centroid</span>
        {centroid ? (
          <strong>
            Lat {Number(centroid[1]).toFixed(4)}, Lon {Number(centroid[0]).toFixed(4)}
          </strong>
        ) : (
          <strong>Not provided by backend</strong>
        )}
      </div>

      <div>
        <span>Slick Area</span>
        <strong>
          {areaSqKm != null ? `${Number(areaSqKm).toFixed(2)} km²` : "Not provided by backend"}
        </strong>
      </div>

      <div>
        <span>Slick Perimeter</span>
        <strong>Not provided by backend</strong>
      </div>

      <div>
        <span>Detection Confidence</span>
        <strong>Not provided by backend</strong>
      </div>

      <div>
        <span>Number of Slicks</span>
        <strong>{metadata.total_slicks_detected ?? "Not provided by backend"}</strong>
      </div>

      <div>
        <span>Probability Threshold</span>
        <strong>{metadata.probability_threshold ?? "Not provided by backend"}</strong>
      </div>

      {metadata.fallback_used && (
        <div className="metadata-wide">
          <span>Fallback Used</span>
          <strong>{metadata.fallback_reason || "Yes (no reason provided)"}</strong>
        </div>
      )}
    </div>
  );
}

export default SlickMetrics;
