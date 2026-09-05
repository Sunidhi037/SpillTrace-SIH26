from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


DataMode = Literal[
    "real",
    "synthetic_test_fixture",
    "analyst_parameter_driven",
    "unavailable",
]

InvestigationStatus = Literal[
    "complete",
    "blocked",
    "partial",
    "failed",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceReference(StrictModel):
    source_id: str = Field(min_length=1)
    source_type: str = Field(min_length=1)
    label: str = Field(min_length=1)
    uri: str | None = None
    provenance: str | None = None


class GeometrySummary(StrictModel):
    geometry_type: str | None = None
    centroid: list[float] | None = None
    area_km2: float | None = Field(default=None, ge=0)
    perimeter_m: float | None = Field(default=None, ge=0)
    polygon_count: int | None = Field(default=None, ge=0)
    geojson: dict[str, Any] | None = None


class CompatibilitySummary(StrictModel):
    compatible: bool
    status_code: str
    reasons: list[str] = Field(default_factory=list)
    sar_time_window: str | None = None
    ais_time_window: str | None = None
    geographic_overlap: bool | None = None
    crs_valid: bool | None = None
    environmental_coverage: bool | None = None


class DriftSummary(StrictModel):
    mode: str | None = None
    run_id: str | None = None
    origin_time_window: str | None = None
    forecast_horizon: str | None = None
    timestep_minutes: int | None = Field(default=None, ge=1)
    particle_count: int | None = Field(default=None, ge=0)
    uncertainty_radius_m: float | None = Field(default=None, ge=0)
    assumptions: list[str] = Field(default_factory=list)
    hindcast_geojson: dict[str, Any] | None = None
    forecast_geojson: dict[str, Any] | None = None


class CandidateEvidence(StrictModel):
    candidate_id: str
    vessel_name: str | None = None
    mmsi: str | None = None
    rank: int = Field(ge=1)
    score: float = Field(ge=0, le=1)
    score_contributions: dict[str, float] = Field(default_factory=dict)
    evidence: list[str] = Field(default_factory=list)
    ais_quality: dict[str, Any] = Field(default_factory=dict)
    source_ids: list[str] = Field(default_factory=list)


class InvestigationReport(StrictModel):
    report_id: str
    generated_at_utc: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    title: str = "SpillTrace Investigation Report"
    status: InvestigationStatus
    data_mode: DataMode
    spill_id: str | None = None
    scene_id: str | None = None
    detector: dict[str, Any] = Field(default_factory=dict)
    geometry: GeometrySummary | None = None
    drift: DriftSummary | None = None
    compatibility: CompatibilitySummary
    sources: list[SourceReference] = Field(default_factory=list)
    candidates: list[CandidateEvidence] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def _safe(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (dict, list)):
        return escape(str(value))
    return escape(str(value))


def _format_datetime(value: datetime) -> str:
    normalized = value.astimezone(timezone.utc)
    return normalized.isoformat().replace("+00:00", "Z")


def _status_label(status: str) -> str:
    return status.replace("_", " ").title()


def _render_list(items: list[str], empty: str = "None recorded.") -> str:
    if not items:
        return f"<p class='muted'>{escape(empty)}</p>"

    return "<ul>" + "".join(f"<li>{escape(item)}</li>" for item in items) + "</ul>"


def _render_sources(sources: list[SourceReference]) -> str:
    if not sources:
        return "<p class='muted'>No source records available.</p>"

    rows = []
    for source in sources:
        uri = (
            f"<a href='{escape(source.uri)}' target='_blank' rel='noreferrer'>"
            f"{escape(source.uri)}</a>"
            if source.uri
            else "—"
        )
        rows.append(
            "<tr>"
            f"<td>{escape(source.source_id)}</td>"
            f"<td>{escape(source.source_type)}</td>"
            f"<td>{escape(source.label)}</td>"
            f"<td>{uri}</td>"
            f"<td>{_safe(source.provenance)}</td>"
            "</tr>"
        )

    return (
        "<div class='table-wrap'><table>"
        "<thead><tr>"
        "<th>ID</th><th>Type</th><th>Label</th><th>URI</th><th>Provenance</th>"
        "</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table></div>"
    )


def _render_candidates(
    candidates: list[CandidateEvidence],
    compatibility: CompatibilitySummary,
) -> str:
    if not compatibility.compatible:
        return (
            "<div class='blocked'>"
            "<strong>Candidate attribution blocked.</strong>"
            "<p>Compatibility requirements were not satisfied. "
            "No vessel should be presented as a candidate.</p>"
            "</div>"
        )

    if not candidates:
        return "<p class='muted'>No candidate records available.</p>"

    rows = []
    for candidate in sorted(candidates, key=lambda item: item.rank):
        contribution_items = "".join(
            f"<li>{escape(key)}: {value:.3f}</li>"
            for key, value in candidate.score_contributions.items()
        )

        evidence_items = "".join(
            f"<li>{escape(item)}</li>" for item in candidate.evidence
        )

        vessel = candidate.vessel_name or "Unknown vessel"
        mmsi = candidate.mmsi or "—"

        rows.append(
            "<tr>"
            f"<td>{candidate.rank}</td>"
            f"<td>{escape(vessel)}</td>"
            f"<td>{escape(mmsi)}</td>"
            f"<td>{candidate.score:.3f}</td>"
            "<td>"
            f"<ul>{contribution_items or '<li>—</li>'}</ul>"
            "</td>"
            "<td>"
            f"<ul>{evidence_items or '<li>—</li>'}</ul>"
            "</td>"
            "</tr>"
        )

    return (
        "<p class='notice'>Wording: highest-ranked candidate under available evidence. "
        "This report does not identify a confirmed polluter.</p>"
        "<div class='table-wrap'><table>"
        "<thead><tr>"
        "<th>Rank</th><th>Vessel</th><th>MMSI</th><th>Score</th>"
        "<th>Score contributions</th><th>Evidence</th>"
        "</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table></div>"
    )


def render_investigation_report(report: InvestigationReport) -> str:
    compatibility = report.compatibility
    status_class = report.status
    generated_at = _format_datetime(report.generated_at_utc)

    geometry = report.geometry
    drift = report.drift

    geometry_rows = ""
    if geometry:
        geometry_rows = (
            f"<tr><th>Geometry type</th><td>{_safe(geometry.geometry_type)}</td></tr>"
            f"<tr><th>Centroid</th><td>{_safe(geometry.centroid)}</td></tr>"
            f"<tr><th>Area km²</th><td>{_safe(geometry.area_km2)}</td></tr>"
            f"<tr><th>Perimeter m</th><td>{_safe(geometry.perimeter_m)}</td></tr>"
            f"<tr><th>Polygon count</th><td>{_safe(geometry.polygon_count)}</td></tr>"
        )
    else:
        geometry_rows = (
            "<tr><th>Geometry</th>"
            "<td class='muted'>No valid slick geometry available.</td></tr>"
        )

    drift_rows = ""
    if drift:
        drift_rows = (
            f"<tr><th>Mode</th><td>{_safe(drift.mode)}</td></tr>"
            f"<tr><th>Run ID</th><td>{_safe(drift.run_id)}</td></tr>"
            f"<tr><th>Origin window</th><td>{_safe(drift.origin_time_window)}</td></tr>"
            f"<tr><th>Forecast horizon</th><td>{_safe(drift.forecast_horizon)}</td></tr>"
            f"<tr><th>Timestep</th><td>{_safe(drift.timestep_minutes)} minutes</td></tr>"
            f"<tr><th>Particle count</th><td>{_safe(drift.particle_count)}</td></tr>"
            f"<tr><th>Uncertainty radius</th>"
            f"<td>{_safe(drift.uncertainty_radius_m)} m</td></tr>"
        )
    else:
        drift_rows = (
            "<tr><th>Drift</th>"
            "<td class='muted'>No drift result available.</td></tr>"
        )

    detector_json = escape(
        str(report.detector) if report.detector else "No detector metadata available."
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(report.title)}</title>
<style>
:root {{
  color-scheme: light;
  --ink: #172033;
  --muted: #687386;
  --line: #dce2ea;
  --surface: #ffffff;
  --page: #f4f7fb;
  --primary: #1d4ed8;
  --success: #087f5b;
  --warning: #b45309;
  --danger: #b42318;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  line-height: 1.5;
}}
main {{
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 18px 60px;
}}
header {{
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 26px;
  margin-bottom: 20px;
}}
h1, h2 {{ margin-top: 0; }}
h1 {{ margin-bottom: 8px; font-size: clamp(1.8rem, 4vw, 2.7rem); }}
h2 {{ font-size: 1.2rem; margin-bottom: 14px; }}
.meta {{
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  color: var(--muted);
  font-size: .94rem;
}}
.badge {{
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: .82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
}}
.badge.complete {{ color: var(--success); background: #dff7ed; }}
.badge.partial {{ color: var(--warning); background: #fff0d6; }}
.badge.blocked, .badge.failed {{ color: var(--danger); background: #ffe3e0; }}
.grid {{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
}}
.card {{
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 22px;
  margin-bottom: 18px;
}}
table {{
  width: 100%;
  border-collapse: collapse;
  font-size: .93rem;
}}
th, td {{
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--line);
  padding: 10px 8px;
}}
th {{ width: 34%; color: var(--muted); font-weight: 650; }}
.table-wrap {{ overflow-x: auto; }}
ul {{ margin: 0; padding-left: 18px; }}
.muted {{ color: var(--muted); }}
.notice {{
  border-left: 4px solid var(--primary);
  background: #edf3ff;
  padding: 10px 12px;
  border-radius: 6px;
}}
.blocked {{
  border-left: 4px solid var(--danger);
  background: #fff1f0;
  padding: 14px;
  border-radius: 6px;
}}
pre {{
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #111827;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 14px;
  font-size: .83rem;
}}
a {{ color: var(--primary); }}
footer {{
  color: var(--muted);
  font-size: .85rem;
  margin-top: 24px;
}}
</style>
</head>
<body>
<main>
<header>
  <span class="badge {escape(status_class)}">
    {escape(_status_label(report.status))}
  </span>
  <h1>{escape(report.title)}</h1>
  <div class="meta">
    <span>Report ID: <strong>{escape(report.report_id)}</strong></span>
    <span>Generated: <strong>{escape(generated_at)}</strong></span>
    <span>Data mode: <strong>{escape(report.data_mode)}</strong></span>
    <span>Spill ID: <strong>{_safe(report.spill_id)}</strong></span>
    <span>Scene ID: <strong>{_safe(report.scene_id)}</strong></span>
  </div>
</header>

<section class="grid">
  <div class="card">
    <h2>Compatibility</h2>
    <table>
      <tr><th>Compatible</th><td>{_safe(compatibility.compatible)}</td></tr>
      <tr><th>Status code</th><td>{escape(compatibility.status_code)}</td></tr>
      <tr><th>SAR time window</th><td>{_safe(compatibility.sar_time_window)}</td></tr>
      <tr><th>AIS time window</th><td>{_safe(compatibility.ais_time_window)}</td></tr>
      <tr><th>Geographic overlap</th><td>{_safe(compatibility.geographic_overlap)}</td></tr>
      <tr><th>CRS valid</th><td>{_safe(compatibility.crs_valid)}</td></tr>
      <tr><th>Environmental coverage</th>
          <td>{_safe(compatibility.environmental_coverage)}</td></tr>
    </table>
    <h3>Compatibility reasons</h3>
    {_render_list(compatibility.reasons)}
  </div>

  <div class="card">
    <h2>Detector metadata</h2>
    <pre>{detector_json}</pre>
  </div>
</section>

<section class="card">
  <h2>Slick geometry</h2>
  <table>{geometry_rows}</table>
</section>

<section class="card">
  <h2>Drift and uncertainty</h2>
  <table>{drift_rows}</table>
  <h3>Assumptions</h3>
  {_render_list(drift.assumptions if drift else [])}
</section>

<section class="card">
  <h2>Candidate evidence</h2>
  {_render_candidates(report.candidates, compatibility)}
</section>

<section class="card">
  <h2>Sources and provenance</h2>
  {_render_sources(report.sources)}
</section>

<section class="grid">
  <div class="card">
    <h2>Warnings</h2>
    {_render_list(report.warnings)}
  </div>
  <div class="card">
    <h2>Limitations</h2>
    {_render_list(report.limitations)}
  </div>
</section>

<footer>
  SpillTrace reports describe evidence-supported results only. A ranked vessel is
  not a confirmed polluter.
</footer>
</main>
</body>
</html>
"""


def build_investigation_report(
    payload: dict[str, Any],
) -> InvestigationReport:
    report = InvestigationReport.model_validate(payload)

    if not report.compatibility.compatible:
        report.candidates = []
        if report.status == "complete":
            report.status = "blocked"

        blocked_message = (
            "Candidate attribution was blocked because compatibility requirements "
            "were not satisfied."
        )
        if blocked_message not in report.limitations:
            report.limitations.append(blocked_message)

    if report.data_mode == "analyst_parameter_driven":
        message = (
            "Drift values are an analyst-parameter-driven scenario simulation, "
            "not a direct observation."
        )
        if message not in report.warnings:
            report.warnings.append(message)

    if report.data_mode == "synthetic_test_fixture":
        message = (
            "Synthetic data is present for testing only and must not be presented "
            "as real investigation evidence."
        )
        if message not in report.warnings:
            report.warnings.append(message)

    return report