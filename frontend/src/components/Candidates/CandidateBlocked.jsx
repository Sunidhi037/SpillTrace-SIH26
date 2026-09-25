import { ErrorNotice } from "../ui/Feedback";

/**
 * Shown when ranking cannot run or the backend rejects it (e.g. HTTP 409
 * COMPATIBILITY_FAILED). Prefers the backend's own reason text.
 */
function CandidateBlocked({ reason, details, onRetry }) {
  return (
    <div className="candidate-blocked">
      <ErrorNotice
        title="CANDIDATE RANKING UNAVAILABLE"
        message="Candidate vessels could not be ranked for this investigation."
        reason={reason}
        onRetry={onRetry}
      />

      {details && (
        <ul className="reason-list">
          {details.temporal_overlap !== undefined && <li>Temporal overlap: {String(details.temporal_overlap)}</li>}
          {details.geographic_overlap !== undefined && <li>Geographic overlap: {String(details.geographic_overlap)}</li>}
          {details.crs_valid !== undefined && <li>CRS valid: {String(details.crs_valid)}</li>}
          {details.environmental_coverage !== undefined && (
            <li>Environmental coverage: {String(details.environmental_coverage)}</li>
          )}
          {Array.isArray(details.reasons) && details.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}

export default CandidateBlocked;
