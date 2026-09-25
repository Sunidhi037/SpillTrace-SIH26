import { useEffect, useState } from "react";
import { NavLink, useMatch } from "react-router-dom";
import { checkHealth } from "../services/api";
import { shortId } from "../utils/format";

function Sidebar({ collapsed, onToggle }) {
  const match = useMatch("/investigation/:id");
  const investigationId = match?.params?.id ? decodeURIComponent(match.params.id) : null;

  // Real backend reachability (GET /health), not a hardcoded indicator.
  const [health, setHealth] = useState("checking");

  useEffect(() => {
    let active = true;
    checkHealth()
      .then(() => active && setHealth("online"))
      .catch(() => active && setHealth("offline"));
    return () => {
      active = false;
    };
  }, []);

  const items = [
    { label: "Dashboard", path: "/dashboard", icon: "⌂" },
    { label: "New Investigation", path: "/upload", icon: "+" },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top">
        {!collapsed && <div className="sidebar-label">WORKSPACE</div>}
        <nav>
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={item.label}
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {investigationId && !collapsed && (
          <div className="sidebar-current">
            <div className="sidebar-label">CURRENT INVESTIGATION</div>
            <div className="sidebar-current-id mono" title={investigationId}>
              {shortId(investigationId, 14)}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-bottom">
        <div className={`health health-${health}`} title={`Backend: ${health}`}>
          <span className="system-dot" />
          {!collapsed && <span>Backend {health}</span>}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? "»" : "« Collapse"}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
