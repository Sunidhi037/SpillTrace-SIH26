import Section from "../ui/Section";

/**
 * Data readiness card. Renders exactly what
 * GET /api/v1/scenes/{id}/compatibility returned: compatible, reasons and
 * the four boolean checks. Blocked reasons are never hidden.
 */
const CHECKS = [
  ["crs_valid", "CRS valid"],
  ["temporal_overlap", "Temporal overlap"],
  ["geographic_overlap", "Geographic overlap"],
  ["environmental_coverage", "Environmental coverage"],
];

const mark = (v) => (v === true ? "✓" : v === false ? "✗" : "–");
const cls = (v) => (v === true ? "ok" : v === false ? "bad" : "na");

function CompatibilityStatus({ compatibility, loading }) {
  const compatible = compatibility?.compatible === true;
  const reasons = compatibility?.reasons || [];

  let tone = "unknown";
  let headline = "COMPATIBILITY UNKNOWN";
  if (loading) {
    tone = "loading";
    headline = "CHECKING DATA COMPATIBILITY…";
  } else if (compatibility) {
    tone = compatible ? "ready" : "blocked";
    headline = compatible ? "READY FOR ANALYSIS" : "BLOCKED";
  }

  return (
    <Section id="readiness" title="DATA READINESS" collapsible defaultOpen>
      <div className={`readiness readiness-${tone}`}>
        <div className="readiness-head">
          <span className="readiness-dot" />
          <strong>{headline}</strong>
        </div>

        {compatibility && (
          <ul className="readiness-checks">
            {CHECKS.map(([key, label]) => (
              <li key={key} className={cls(compatibility[key])}>
                <span aria-hidden="true">{mark(compatibility[key])}</span>
                {label}
              </li>
            ))}
          </ul>
        )}

        {!loading && !compatibility && (
          <p className="muted">The backend compatibility check could not be read for this scene.</p>
        )}

        {!loading && compatibility && (
          <p className="readiness-ranking">
            Candidate ranking:{" "}
            <strong className={compatible ? "text-ok" : "text-bad"}>
              {compatible ? "AVAILABLE" : "UNAVAILABLE"}
            </strong>
          </p>
        )}

        {!loading && !compatible && reasons.length > 0 && (
          <div className="readiness-reasons">
            <span className="label">Reason</span>
            <ul>
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {!loading && compatibility && !compatible && reasons.length === 0 && (
          <p className="muted">No specific reason was returned by the backend.</p>
        )}
      </div>
    </Section>
  );
}

export default CompatibilityStatus;
