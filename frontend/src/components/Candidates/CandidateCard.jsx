import ScoreBar from "../ui/ScoreBar";
import { pct } from "../../utils/format";

/**
 * Compact row by default; the top-ranked candidate is shown expanded with its
 * headline feature scores. "Score" is a compatibility score under the
 * available evidence, never a confirmation of responsibility.
 */
function CandidateCard({ candidate, isSelected, expanded, onSelect }) {
  const score = pct(candidate.score) ?? 0;
  const c = candidate.score_contributions || {};

  return (
    <div className={`candidate ${isSelected ? "selected" : ""} ${expanded ? "expanded" : ""}`}>
      <button type="button" className="candidate-row" onClick={onSelect} aria-pressed={isSelected}>
        <span className="candidate-rank">#{String(candidate.rank).padStart(2, "0")}</span>
        <span className="candidate-main">
          <strong>{candidate.vessel_name || "Unknown vessel"}</strong>
          <small>MMSI {candidate.mmsi || "Not available"}</small>
        </span>
        <span className="candidate-score">
          <strong>{score}%</strong>
          <small>compatibility</small>
        </span>
      </button>

      {expanded && (
        <div className="candidate-detail">
          <div className="candidate-label">
            {candidate.label || "Candidate under available evidence"}
          </div>
          <ScoreBar compact label="Spatial proximity" value={c.spatial} />
          <ScoreBar compact label="Temporal overlap" value={c.temporal} />
          <ScoreBar compact label="Heading compatibility" value={c.heading} />
          <ScoreBar compact label="Route intersection" value={c.intersection} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onSelect}>
            VIEW EVIDENCE
          </button>
        </div>
      )}
    </div>
  );
}

export default CandidateCard;
