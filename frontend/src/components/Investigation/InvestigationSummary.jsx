import { NA, formatDate, formatKm2 } from "../../utils/format";

/** Compact strip: only values the backend actually returned; else "Not available". */
export default function InvestigationSummary({ area, detectionLabel, source, acquisition, dataMode }) {
  const items = [
    ["DETECTED AREA", area != null ? formatKm2(area) : NA],
    ["DETECTION", detectionLabel || NA],
    ["SCENE SOURCE", source || NA],
    ["ACQUISITION", acquisition ? formatDate(acquisition) : NA],
  ];

  return (
    <div className="inv-summary">
      {items.map(([label, value]) => (
        <div className="summary-item" key={label}>
          <span className="kv-label">{label}</span>
          <strong className={value === NA ? "na" : ""} title={value}>{value}</strong>
        </div>
      ))}
      {dataMode === "TEST_FIXTURE" && (
        <div className="summary-item">
          <span className="kv-label">DATA MODE</span>
          <strong className="amber">Synthetic demonstration</strong>
        </div>
      )}
    </div>
  );
}
