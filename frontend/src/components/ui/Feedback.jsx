export function LoadingNotice({ title, lines = [] }) {
  return (
    <div className="notice notice-loading" role="status" aria-live="polite">
      <div className="notice-title">
        <span className="spinner" aria-hidden="true" />
        <strong>{title}</strong>
      </div>
      {lines.length > 0 && (
        <ul className="notice-lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ErrorNotice({ title, message, reason, onRetry, retryLabel = "TRY AGAIN" }) {
  return (
    <div className="notice notice-error" role="alert">
      <strong className="notice-title-text">{title}</strong>
      {message && <p>{message}</p>}
      {reason && (
        <div className="notice-reason">
          <span>Reason</span>
          <code>{reason}</code>
        </div>
      )}
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function SuccessLine({ children }) {
  return (
    <div className="success-line">
      <span aria-hidden="true">✓</span>
      <span>{children}</span>
    </div>
  );
}

export function Checklist({ items }) {
  return (
    <ul className="checklist">
      {items.map((item) => (
        <li key={item.key} className={item.ok ? "ok" : "todo"}>
          <span aria-hidden="true">{item.ok ? "✓" : "○"}</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function KV({ label, value, mono = false, wide = false }) {
  return (
    <div className={`kv ${wide ? "kv-wide" : ""}`}>
      <span className="kv-label">{label}</span>
      <span className={`kv-value ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}
