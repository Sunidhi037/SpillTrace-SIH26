export default function ScoreBar({ label, value, tone = "accent", compact = false }) {
  const has = value != null && !Number.isNaN(Number(value));
  const p = has ? Math.round(Number(value) * 100) : null;

  return (
    <div className={`score-row ${compact ? "compact" : ""}`}>
      <span className="score-label">{label}</span>
      <div className="score-track" aria-hidden="true">
        <div className={`score-fill tone-${tone}`} style={{ width: `${p ?? 0}%` }} />
      </div>
      <span className="score-value">{has ? `${p}%` : "—"}</span>
    </div>
  );
}
