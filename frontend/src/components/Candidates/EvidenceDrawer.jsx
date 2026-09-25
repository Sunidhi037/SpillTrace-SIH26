import ScoreBar from "../ui/ScoreBar";
import { KV } from "../ui/Feedback";
import { NA, pct } from "../../utils/format";

/**
 * Evidence for the selected candidate. Reads only CandidateResult fields
 * (score_contributions, ais_quality, drift_evidence, evidence_statements).
 */
const CONTRIBUTIONS = [
  ["spatial", "Spatial proximity"],
  ["temporal", "Temporal overlap"],
  ["heading", "Heading compatibility"],
  ["intersection", "Route intersection"],
  ["continuity", "Track continuity"],
  ["quality", "AIS data quality"],
];

function EvidenceDrawer({ candidate, loading }) {
  if (!candidate) return null;

  const contributions = candidate.score_contributions || {};
  const q = candidate.ais_quality || {};
  const drift = candidate.drift_evidence || {};
  const statements = Array.isArray(candidate.evidence_statements) ? candidate.evidence_statements : [];

  return (
    <div className="evidence">
      <div className="evidence-head">
        <div>
          <strong>{candidate.vessel_name || "Unknown vessel"}</strong>
          <small>
            MMSI {candidate.mmsi || NA} · rank #{candidate.rank}
          </small>
        </div>
        <span className="evidence-score">{pct(candidate.score) ?? 0}%</span>
      </div>

      <p className="candidate-label">{candidate.label || "Candidate under available evidence"}</p>
      {loading && <p className="hint">Loading additional evidence…</p>}

      <div className="score-list">
        {CONTRIBUTIONS.filter(([key]) => contributions[key] != null).map(([key, label]) => (
          <ScoreBar key={key} label={label} value={contributions[key]} tone="green" />
        ))}
      </div>

      {statements.length > 0 && (
        <ul className="evidence-statements">
          {statements.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}

      <details className="assumptions">
        <summary>AIS quality and drift evidence</summary>
        <div className="kv-grid">
          <KV label="Positions" value={q.position_count ?? NA} />
          <KV label="Gaps" value={q.gap_count ?? NA} />
          <KV label="Completeness" value={q.data_completeness != null ? `${pct(q.data_completeness)}%` : NA} />
          <KV label="AIS source" value={q.source || NA} />
          <KV label="Drift run" value={drift.run_type || NA} />
          <KV label="Mode" value={drift.mode || NA} />
          <KV
            label="Uncertainty radius"
            value={drift.uncertainty_radius_m != null ? `${Math.round(drift.uncertainty_radius_m)} m` : NA}
          />
        </div>
      </details>
    </div>
  );
}

export default EvidenceDrawer;
