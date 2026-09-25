import { useMatch, useNavigate } from "react-router-dom";
import { shortId } from "../utils/format";

function Header() {
  const navigate = useNavigate();
  const match = useMatch("/investigation/:id");
  const investigationId = match?.params?.id;

  return (
    <header className="app-header">
      <button className="brand" onClick={() => navigate("/dashboard")} aria-label="SpillTrace — new investigation">
        <span className="brand-mark">ST</span>
        <span className="brand-text">
          <span className="brand-name">SPILLTRACE</span>
          <span className="brand-subtitle">MARINE INTELLIGENCE</span>
        </span>
      </button>

      <div className="header-center">
        <span className="system-status">INVESTIGATION SYSTEM</span>
        {investigationId && (
          <>
            <span className="status-divider">/</span>
            <span className="investigation-chip mono" title={investigationId}>
              {shortId(decodeURIComponent(investigationId), 12)}
            </span>
          </>
        )}
      </div>

      <div className="header-right">
        <span className="header-info">SIH 2026 · PS 26143</span>
        <button className="btn btn-primary btn-sm" onClick={() => navigate("/upload")}>
          + New Investigation
        </button>
      </div>
    </header>
  );
}

export default Header;
