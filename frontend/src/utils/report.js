import { geometryProperties } from "./investigation";

/**
 * Builds the exact payload the backend report endpoints already accept.
 *
 * IMPORTANT:
 * This function intentionally keeps the existing backend payload structure.
 * The UI/report styling is handled separately by buildLocalInvestigationReportHtml().
 */
export function buildReportPayload({
  spillId,
  detection,
  slickGeojson,
  slickIsMock,
  candidateRun,
  compatibility,
  scene,
  hindcastResult,
  forecastResult,
  aisTracksGeojson,
  detectionError,
}) {
  const geoProps = geometryProperties(detection);

  let status = "failed";

  if (candidateRun?.candidates?.length) {
    status = "complete";
  } else if (
    detection?.status === "COMPLETED" ||
    slickGeojson
  ) {
    status = "partial";
  } else if (
    compatibility &&
    compatibility.compatible === false
  ) {
    status = "blocked";
  }

  const dataMode = slickIsMock
    ? "synthetic_test_fixture"
    : detection?.status === "COMPLETED"
      ? "real"
      : "unavailable";

  const payload = {
    title: `SpillTrace Investigation — ${spillId}`,

    status,

    data_mode: dataMode,

    spill_id: spillId,

    scene_id: scene?.scene_id || null,

    detector: detection?.metadata || {},

    geometry: slickGeojson
      ? {
          geometry_type:
            slickGeojson.geometry?.type ||
            slickGeojson.type ||
            null,

          centroid: geoProps.centroid,

          area_km2: geoProps.area_sq_km,

          perimeter_m: geoProps.perimeter_m,

          polygon_count: 1,

          geojson: slickGeojson,
        }
      : null,

    drift: {
      mode:
        hindcastResult?.data_mode ||
        forecastResult?.data_mode ||
        null,

      run_id:
        hindcastResult?.run_id ||
        forecastResult?.run_id ||
        null,

      origin_time_window: hindcastResult
        ? `${hindcastResult.start_time_utc} → ${hindcastResult.end_time_utc}`
        : null,

      forecast_horizon: forecastResult
        ? `${forecastResult.start_time_utc} → ${forecastResult.end_time_utc}`
        : null,

      timestep_minutes:
        hindcastResult?.timestep_minutes ||
        forecastResult?.timestep_minutes ||
        null,

      particle_count:
        hindcastResult?.particle_count ||
        forecastResult?.particle_count ||
        null,

      uncertainty_radius_m:
        hindcastResult?.uncertainty_radius_m ??
        forecastResult?.uncertainty_radius_m ??
        null,

      assumptions: [
        ...(hindcastResult?.assumptions || []),
        ...(forecastResult?.assumptions || []),
      ],

      hindcast_geojson:
        hindcastResult?.corridor || null,

      forecast_geojson:
        forecastResult?.corridor || null,
    },

    compatibility: {
      compatible: compatibility?.compatible === true,

      status_code:
        compatibility?.status ||
        "unknown",

      reasons: compatibility?.reasons || [],

      sar_time_window:
        scene?.acquisition_start_utc &&
        scene?.acquisition_end_utc
          ? `${scene.acquisition_start_utc} → ${scene.acquisition_end_utc}`
          : null,

      geographic_overlap:
        compatibility?.geographic_overlap ??
        null,

      crs_valid:
        compatibility?.crs_valid ??
        null,

      environmental_coverage:
        compatibility?.environmental_coverage ??
        null,
    },

    sources: [
      scene
        ? {
            source_id: scene.scene_id,

            source_type: "SAR",

            label:
              scene.source ||
              "SAR scene",

            provenance:
              "Backend scene metadata",
          }
        : null,

      aisTracksGeojson
        ? {
            source_id:
              "ais-configured",

            source_type: "AIS",

            label:
              "AIS track source",

            provenance:
              "Configured frontend AIS endpoint",
          }
        : null,
    ].filter(Boolean),

    candidates: (
      candidateRun?.candidates ||
      []
    ).map((candidate) => ({
      candidate_id:
        candidate.candidate_id,

      vessel_name:
        candidate.vessel_name,

      mmsi:
        candidate.mmsi,

      rank:
        candidate.rank,

      score:
        candidate.score,

      score_contributions:
        candidate.score_contributions ||
        {},

      evidence:
        candidate.evidence_statements ||
        [],

      ais_quality:
        candidate.ais_quality ||
        {},

      source_ids:
        candidate.source_reference
          ? [
              candidate.source_reference,
            ]
          : [],
    })),

    limitations: [
      !aisTracksGeojson
        ? "AIS tracks are not available from the configured frontend endpoint."
        : null,

      !candidateRun?.candidates?.length
        ? "No candidate ranking result is available."
        : null,

      slickIsMock
        ? "Slick geometry came from the backend demonstration endpoint, not the real ML detector."
        : null,
    ].filter(Boolean),

    warnings:
      detectionError
        ? [detectionError]
        : [],
  };

  return payload;
}


/**
 * Frontend fallback renderer used only when the backend HTML report endpoint
 * is unavailable.
 *
 * This function uses only values already present in the report payload.
 * It does not invent investigation results.
 *
 * REPORT UI:
 * - Dark navy SpillTrace header
 * - White/light report body
 * - Professional investigation cards
 * - Candidate ranking table
 * - Sources and limitations
 * - Collapsible raw evidence
 * - Print-friendly layout
 */
export function buildLocalInvestigationReportHtml(payload) {
  const esc = (value) =>
    String(value ?? "Not available")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const json = (value) =>
    esc(JSON.stringify(value ?? null, null, 2));

  const candidates = payload?.candidates || [];
  const limitations = payload?.limitations || [];
  const warnings = payload?.warnings || [];
  const sources = payload?.sources || [];

  const status = String(
    payload?.status || "unknown"
  ).toLowerCase();

  const statusLabel =
    status === "complete"
      ? "Investigation complete"
      : status === "partial"
        ? "Partially complete"
        : status === "blocked"
          ? "Investigation blocked"
          : status === "failed"
            ? "Investigation failed"
            : "Status unavailable";

  const statusClass =
    status === "complete"
      ? "status-complete"
      : status === "partial"
        ? "status-partial"
        : status === "blocked"
          ? "status-blocked"
          : "status-failed";

  const geometry = payload?.geometry || {};
  const drift = payload?.drift || {};
  const compatibility =
    payload?.compatibility || {};

  const detector =
    payload?.detector || {};

  const sarSource =
    sources.find(
      (source) =>
        source?.source_type === "SAR"
    ) || null;

  const aisSource =
    sources.find(
      (source) =>
        source?.source_type === "AIS"
    ) || null;

  const formatValue = (value) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return "Not available";
    }

    return value;
  };

  const boolLabel = (value) => {
    if (value === true) {
      return "Yes";
    }

    if (value === false) {
      return "No";
    }

    return "Not available";
  };

  const candidateRows = candidates.length
    ? candidates
        .map(
          (candidate) => `
            <tr>
              <td>
                <span class="rank-badge">
                  ${esc(formatValue(candidate.rank))}
                </span>
              </td>

              <td>
                <div class="vessel-name">
                  ${esc(
                    formatValue(
                      candidate.vessel_name
                    )
                  )}
                </div>
              </td>

              <td class="mono">
                ${esc(
                  formatValue(
                    candidate.mmsi
                  )
                )}
              </td>

              <td>
                <strong>
                  ${esc(
                    formatValue(
                      candidate.score
                    )
                  )}
                </strong>
              </td>
            </tr>
          `
        )
        .join("")
    : `
        <tr>
          <td
            colspan="4"
            class="empty-table"
          >
            No candidate ranking result is available.
          </td>
        </tr>
      `;

  const sourceCards = sources.length
    ? sources
        .map(
          (source) => `
            <div class="source-card">
              <div class="source-icon">
                ${source?.source_type === "AIS"
                  ? "AIS"
                  : "SAR"}
              </div>

              <div class="source-content">
                <div class="source-type">
                  ${esc(
                    formatValue(
                      source?.source_type
                    )
                  )}
                </div>

                <div class="source-label">
                  ${esc(
                    formatValue(
                      source?.label
                    )
                  )}
                </div>

                <div class="source-provenance">
                  ${esc(
                    formatValue(
                      source?.provenance
                    )
                  )}
                </div>
              </div>
            </div>
          `
        )
        .join("")
    : `
        <div class="empty-state">
          No evidence sources are available.
        </div>
      `;

  const limitationCards = limitations.length
    ? limitations
        .map(
          (item) => `
            <div class="notice notice-warning">
              <span class="notice-icon">!</span>
              <span>${esc(item)}</span>
            </div>
          `
        )
        .join("")
    : `
        <div class="notice notice-success">
          <span class="notice-icon">✓</span>
          <span>No reported limitations.</span>
        </div>
      `;

  const warningCards = warnings.length
    ? warnings
        .map(
          (item) => `
            <div class="notice notice-danger">
              <span class="notice-icon">!</span>
              <span>${esc(item)}</span>
            </div>
          `
        )
        .join("")
    : "";

  return `<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />

  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  />

  <title>
    ${esc(
      payload?.title ||
        "SpillTrace Investigation Report"
    )}
  </title>

  <style>

    /* =====================================================
       BASE
       ===================================================== */

    :root {
      --navy: #092238;
      --navy-2: #0d2e47;
      --blue: #1769aa;
      --cyan: #16a6c9;
      --teal: #159a8c;
      --green: #2e9b67;
      --orange: #f28c28;

      --ink: #152536;
      --muted: #6d7d8d;
      --muted-2: #8a99a7;

      --bg: #f4f7fa;
      --card: #ffffff;

      --border: #dce4eb;
      --border-light: #e8eef3;

      --danger: #c94d4d;
      --warning: #b77a12;
    }

    * {
      box-sizing: border-box;
    }

    html {
      background: var(--bg);
    }

    body {
      margin: 0;

      background:
        linear-gradient(
          180deg,
          #edf3f7 0,
          #f7f9fb 360px,
          #f4f7fa 100%
        );

      color: var(--ink);

      font-family:
        Inter,
        "Segoe UI",
        Roboto,
        Arial,
        sans-serif;

      line-height: 1.5;
    }

    .page {
      width: min(
        1180px,
        calc(100% - 48px)
      );

      margin: 34px auto 64px;
    }


    /* =====================================================
       REPORT HERO
       ===================================================== */

    .hero {
      position: relative;

      overflow: hidden;

      padding: 34px 38px 32px;

      border-radius: 18px;

      background:
        linear-gradient(
          135deg,
          #071827 0%,
          #0a253b 58%,
          #0d3047 100%
        );

      color: #ffffff;

      box-shadow:
        0 18px 45px
        rgba(10, 32, 50, 0.16);
    }

    .hero::after {
      content: "";

      position: absolute;

      width: 300px;
      height: 300px;

      right: -100px;
      top: -160px;

      border-radius: 50%;

      border: 1px solid
        rgba(67, 202, 231, 0.15);

      box-shadow:
        0 0 0 28px
          rgba(67, 202, 231, 0.035),
        0 0 0 58px
          rgba(67, 202, 231, 0.02);
    }

    .eyebrow {
      position: relative;
      z-index: 1;

      margin-bottom: 9px;

      color: #55cee9;

      font-size: 11px;
      font-weight: 800;

      letter-spacing: 0.17em;

      text-transform: uppercase;
    }

    .hero h1 {
      position: relative;
      z-index: 1;

      margin: 0;

      max-width: 900px;

      color: #ffffff;

      font-size: 30px;
      line-height: 1.2;

      letter-spacing: -0.025em;
    }

    .hero-subtitle {
      position: relative;
      z-index: 1;

      margin-top: 8px;

      color: #a9bac8;

      font-size: 13px;
    }


    /* =====================================================
       HERO METADATA
       ===================================================== */

    .meta {
      position: relative;
      z-index: 1;

      display: grid;

      grid-template-columns:
        repeat(4, minmax(0, 1fr));

      gap: 12px;

      margin-top: 25px;
    }

    .meta-card {
      min-width: 0;

      padding: 14px 15px;

      border:
        1px solid
        rgba(255, 255, 255, 0.10);

      border-radius: 10px;

      background:
        rgba(255, 255, 255, 0.055);

      backdrop-filter: blur(8px);
    }

    .meta-label {
      display: block;

      margin-bottom: 6px;

      color: #8fa7b9;

      font-size: 9px;
      font-weight: 700;

      letter-spacing: 0.12em;

      text-transform: uppercase;
    }

    .meta-value {
      display: block;

      color: #f3f8fb;

      font-size: 12px;
      font-weight: 650;

      overflow-wrap: anywhere;
    }

    .status-pill {
      display: inline-flex;

      align-items: center;

      gap: 6px;

      padding: 5px 8px;

      border-radius: 999px;

      font-size: 10px;
      font-weight: 750;

      line-height: 1.1;
    }

    .status-pill::before {
      content: "";

      width: 6px;
      height: 6px;

      border-radius: 50%;

      background: currentColor;
    }

    .status-complete {
      color: #5ee1ad;

      background:
        rgba(46, 155, 103, 0.14);

      border:
        1px solid
        rgba(46, 155, 103, 0.30);
    }

    .status-partial {
      color: #63cfe9;

      background:
        rgba(22, 166, 201, 0.13);

      border:
        1px solid
        rgba(22, 166, 201, 0.28);
    }

    .status-blocked {
      color: #f0bd65;

      background:
        rgba(242, 140, 40, 0.13);

      border:
        1px solid
        rgba(242, 140, 40, 0.28);
    }

    .status-failed {
      color: #f08080;

      background:
        rgba(201, 77, 77, 0.13);

      border:
        1px solid
        rgba(201, 77, 77, 0.28);
    }


    /* =====================================================
       SECTIONS
       ===================================================== */

    .section {
      margin-top: 18px;
    }

    .section-title {
      margin: 0 0 12px;

      color: #17293b;

      font-size: 17px;
      font-weight: 750;

      letter-spacing: -0.01em;
    }

    .section-subtitle {
      margin: -6px 0 13px;

      color: var(--muted);

      font-size: 11px;
    }

    .card {
      padding: 20px;

      background: var(--card);

      border:
        1px solid
        var(--border);

      border-radius: 13px;

      box-shadow:
        0 4px 16px
        rgba(21, 45, 64, 0.045);
    }


    /* =====================================================
       TWO COLUMN
       ===================================================== */

    .grid {
      display: grid;

      grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 1fr);

      gap: 16px;
    }


    /* =====================================================
       FIELD / VALUE
       ===================================================== */

    .field {
      min-width: 0;
    }

    .field + .field {
      margin-top: 15px;
    }

    .label {
      display: block;

      margin-bottom: 5px;

      color: var(--muted);

      font-size: 9px;
      font-weight: 700;

      letter-spacing: 0.11em;

      text-transform: uppercase;
    }

    .value {
      display: block;

      color: var(--ink);

      font-size: 13px;
      font-weight: 650;

      overflow-wrap: anywhere;
    }

    .value.large {
      font-size: 17px;
      letter-spacing: -0.015em;
    }

    .mono {
      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;

      font-size: 11px;
    }


    /* =====================================================
       DETECTION / SCENE
       ===================================================== */

    .card-heading {
      display: flex;

      align-items: center;
      justify-content: space-between;

      gap: 12px;

      margin-bottom: 18px;
    }

    .card-heading h2 {
      margin: 0;

      color: var(--ink);

      font-size: 16px;
      font-weight: 750;
    }

    .card-heading span {
      color: var(--muted);

      font-size: 10px;
    }

    .metric-row {
      display: grid;

      grid-template-columns:
        repeat(2, minmax(0, 1fr));

      gap: 18px;

      padding-top: 2px;
    }

    .metric {
      min-width: 0;
    }

    .metric + .metric {
      margin-top: 0;
    }


    /* =====================================================
       DRIFT / COMPATIBILITY
       ===================================================== */

    .data-grid {
      display: grid;

      grid-template-columns:
        repeat(3, minmax(0, 1fr));

      gap: 12px;
    }

    .data-item {
      min-width: 0;

      padding: 13px;

      background: #f8fafc;

      border:
        1px solid
        var(--border-light);

      border-radius: 9px;
    }

    .data-item .label {
      margin-bottom: 6px;
    }

    .data-item .value {
      font-size: 12px;
    }


    /* =====================================================
       ASSUMPTIONS
       ===================================================== */

    .assumptions {
      margin-top: 16px;

      padding-top: 15px;

      border-top:
        1px solid
        var(--border-light);
    }

    .assumptions-list {
      margin: 8px 0 0;
      padding-left: 18px;

      color: #526477;

      font-size: 11px;
    }

    .assumptions-list li + li {
      margin-top: 5px;
    }


    /* =====================================================
       CANDIDATE TABLE
       ===================================================== */

    .table-wrap {
      overflow-x: auto;

      border:
        1px solid
        var(--border);

      border-radius: 10px;
    }

    table {
      width: 100%;

      border-collapse: collapse;

      background: #ffffff;
    }

    th {
      padding: 11px 12px;

      background: #f7f9fb;

      color: #718094;

      font-size: 9px;
      font-weight: 750;

      letter-spacing: 0.10em;

      text-align: left;

      text-transform: uppercase;

      border-bottom:
        1px solid
        var(--border);
    }

    td {
      padding: 12px;

      color: #33485c;

      font-size: 12px;

      border-bottom:
        1px solid
        var(--border-light);

      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    tbody tr:hover {
      background: #f8fbfd;
    }

    .rank-badge {
      display: inline-flex;

      align-items: center;
      justify-content: center;

      min-width: 27px;
      height: 27px;

      padding: 0 7px;

      border-radius: 7px;

      background: #edf5f9;

      color: #1769aa;

      font-size: 11px;
      font-weight: 800;
    }

    .vessel-name {
      color: #152b3d;

      font-weight: 700;
    }

    .empty-table {
      padding: 25px;

      color: var(--muted);

      text-align: center;
    }


    /* =====================================================
       SOURCES
       ===================================================== */

    .source-grid {
      display: grid;

      grid-template-columns:
        repeat(2, minmax(0, 1fr));

      gap: 12px;
    }

    .source-card {
      display: flex;

      gap: 12px;

      padding: 14px;

      background: #f8fafc;

      border:
        1px solid
        var(--border-light);

      border-radius: 10px;
    }

    .source-icon {
      display: flex;

      align-items: center;
      justify-content: center;

      width: 34px;
      height: 34px;

      flex: 0 0 34px;

      border-radius: 8px;

      background: #eaf5f8;

      color: #137e9d;

      font-size: 9px;
      font-weight: 800;

      letter-spacing: 0.05em;
    }

    .source-content {
      min-width: 0;
    }

    .source-type {
      margin-bottom: 2px;

      color: #718094;

      font-size: 8px;
      font-weight: 750;

      letter-spacing: 0.10em;

      text-transform: uppercase;
    }

    .source-label {
      color: #1b3043;

      font-size: 12px;
      font-weight: 700;

      overflow-wrap: anywhere;
    }

    .source-provenance {
      margin-top: 3px;

      color: #7a8a9a;

      font-size: 10px;
    }


    /* =====================================================
       NOTICES
       ===================================================== */

    .notice {
      display: flex;

      align-items: flex-start;

      gap: 10px;

      padding: 12px 14px;

      border-radius: 8px;

      font-size: 11px;

      line-height: 1.5;
    }

    .notice + .notice {
      margin-top: 8px;
    }

    .notice-icon {
      display: flex;

      align-items: center;
      justify-content: center;

      width: 19px;
      height: 19px;

      flex: 0 0 19px;

      border-radius: 50%;

      font-size: 10px;
      font-weight: 800;
    }

    .notice-warning {
      background: #fff8e9;

      border:
        1px solid
        #f2dfb4;

      color: #73571e;
    }

    .notice-warning .notice-icon {
      background: #f2d99c;

      color: #694c0f;
    }

    .notice-danger {
      background: #fff1f1;

      border:
        1px solid
        #f1cccc;

      color: #7b3838;
    }

    .notice-danger .notice-icon {
      background: #e8aaaa;

      color: #702b2b;
    }

    .notice-success {
      background: #eef9f3;

      border:
        1px solid
        #cce9d8;

      color: #2d6548;
    }

    .notice-success .notice-icon {
      background: #c8e6d4;

      color: #267247;
    }


    /* =====================================================
       RAW EVIDENCE
       ===================================================== */

    details {
      overflow: hidden;

      border:
        1px solid
        var(--border);

      border-radius: 10px;

      background: #ffffff;
    }

    summary {
      cursor: pointer;

      padding: 14px 16px;

      color: #23394c;

      font-size: 12px;
      font-weight: 700;

      list-style: none;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary::after {
      content: "＋";

      float: right;

      color: #7890a3;

      font-size: 14px;
    }

    details[open] summary::after {
      content: "−";
    }

    .raw-content {
      padding: 0 16px 16px;
    }

    pre {
      margin: 0;

      padding: 15px;

      overflow-x: auto;

      background: #f6f8fa;

      border:
        1px solid
        var(--border-light);

      border-radius: 8px;

      color: #42566a;

      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        monospace;

      font-size: 10px;

      line-height: 1.55;

      white-space: pre-wrap;

      overflow-wrap: anywhere;
    }


    /* =====================================================
       EMPTY STATE
       ===================================================== */

    .empty-state {
      padding: 20px;

      background: #f7f9fb;

      border:
        1px dashed
        #ccd7e0;

      border-radius: 9px;

      color: var(--muted);

      font-size: 11px;

      text-align: center;
    }


    /* =====================================================
       FOOTER
       ===================================================== */

    .report-footer {
      margin-top: 24px;

      padding-top: 17px;

      border-top:
        1px solid
        var(--border);

      color: #7a8997;

      font-size: 10px;

      line-height: 1.55;

      text-align: center;
    }

    .report-footer strong {
      color: #506274;
    }


    /* =====================================================
       RESPONSIVE
       ===================================================== */

    @media (max-width: 900px) {
      .meta {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }

      .data-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 700px) {
      .page {
        width: min(
          100% - 28px,
          1180px
        );

        margin-top: 18px;
      }

      .hero {
        padding: 25px 21px;
      }

      .hero h1 {
        font-size: 23px;
      }

      .meta,
      .grid,
      .source-grid,
      .data-grid,
      .metric-row {
        grid-template-columns: 1fr;
      }

      .card {
        padding: 16px;
      }
    }


    /* =====================================================
       PRINT
       ===================================================== */

    @media print {
      body {
        background: #ffffff;
      }

      .page {
        width: 100%;
        margin: 0;
      }

      .hero {
        box-shadow: none;

        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .card {
        box-shadow: none;
      }

      .section {
        break-inside: avoid;
      }

      details {
        break-inside: auto;
      }
    }

  </style>
</head>

<body>

  <main class="page">

    <!-- =================================================
         HERO
         ================================================= -->

    <header class="hero">

      <div class="eyebrow">
        SPILLTRACE · MARINE INTELLIGENCE
      </div>

      <h1>
        ${esc(
          payload?.title ||
            "SpillTrace Investigation Report"
        )}
      </h1>

      <div class="hero-subtitle">
        Investigation support report ·
        evidence and results available at export time
      </div>

      <div class="meta">

        <div class="meta-card">

          <span class="meta-label">
            Status
          </span>

          <span
            class="status-pill ${statusClass}"
          >
            ${esc(statusLabel)}
          </span>

        </div>


        <div class="meta-card">

          <span class="meta-label">
            Spill ID
          </span>

          <span class="meta-value">
            ${esc(
              formatValue(
                payload?.spill_id
              )
            )}
          </span>

        </div>


        <div class="meta-card">

          <span class="meta-label">
            SAR Scene
          </span>

          <span class="meta-value">
            ${esc(
              formatValue(
                payload?.scene_id
              )
            )}
          </span>

        </div>


        <div class="meta-card">

          <span class="meta-label">
            Data Mode
          </span>

          <span class="meta-value">
            ${esc(
              formatValue(
                payload?.data_mode
              )
            )}
          </span>

        </div>

      </div>

    </header>


    <!-- =================================================
         DETECTION + SCENE
         ================================================= -->

    <section class="section grid">

      <article class="card">

        <div class="card-heading">

          <h2>
            Detection
          </h2>

          <span>
            SAR-derived evidence
          </span>

        </div>


        <div class="metric-row">

          <div class="metric">

            <span class="label">
              Detected area
            </span>

            <span class="value large">
              ${esc(
                formatValue(
                  geometry?.area_km2
                )
              )}
              km²
            </span>

          </div>


          <div class="metric">

            <span class="label">
              Polygon count
            </span>

            <span class="value">
              ${esc(
                formatValue(
                  geometry?.polygon_count
                )
              )}
            </span>

          </div>

        </div>


        <div class="field">

          <span class="label">
            Centroid
          </span>

          <span class="value mono">
            ${esc(
              formatValue(
                geometry?.centroid
              )
            )}
          </span>

        </div>


        <div class="field">

          <span class="label">
            Perimeter
          </span>

          <span class="value">
            ${esc(
              formatValue(
                geometry?.perimeter_m
              )
            )}
            m
          </span>

        </div>


        <div class="field">

          <span class="label">
            Detector
          </span>

          <span class="value">
            ${esc(
              formatValue(
                detector?.detector_name ||
                  detector?.name
              )
            )}
          </span>

        </div>

      </article>


      <article class="card">

        <div class="card-heading">

          <h2>
            Scene
          </h2>

          <span>
            SAR source metadata
          </span>

        </div>


        <div class="field">

          <span class="label">
            Source
          </span>

          <span class="value">
            ${esc(
              formatValue(
                sarSource?.label
              )
            )}
          </span>

        </div>


        <div class="field">

          <span class="label">
            Scene ID
          </span>

          <span class="value mono">
            ${esc(
              formatValue(
                payload?.scene_id
              )
            )}
          </span>

        </div>


        <div class="field">

          <span class="label">
            Source type
          </span>

          <span class="value">
            ${esc(
              formatValue(
                sarSource?.source_type
              )
            )}
          </span>

        </div>


        <div class="field">

          <span class="label">
            Provenance
          </span>

          <span class="value">
            ${esc(
              formatValue(
                sarSource?.provenance
              )
            )}
          </span>

        </div>

      </article>

    </section>


    <!-- =================================================
         DRIFT ANALYSIS
         ================================================= -->

    <section class="section card">

      <div class="card-heading">

        <h2>
          Drift Analysis
        </h2>

        <span>
          Hindcast + forecast
        </span>

      </div>


      <div class="data-grid">

        <div class="data-item">

          <span class="label">
            Mode
          </span>

          <span class="value">
            ${esc(
              formatValue(
                drift?.mode
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Run ID
          </span>

          <span class="value mono">
            ${esc(
              formatValue(
                drift?.run_id
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Timestep
          </span>

          <span class="value">
            ${esc(
              formatValue(
                drift?.timestep_minutes
              )
            )}
            ${
              drift?.timestep_minutes !==
              null &&
              drift?.timestep_minutes !==
              undefined
                ? "min"
                : ""
            }
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Particle count
          </span>

          <span class="value">
            ${esc(
              formatValue(
                drift?.particle_count
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Uncertainty radius
          </span>

          <span class="value">
            ${esc(
              formatValue(
                drift?.uncertainty_radius_m
              )
            )}
            ${
              drift?.uncertainty_radius_m !==
              null &&
              drift?.uncertainty_radius_m !==
              undefined
                ? "m"
                : ""
            }
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Forecast horizon
          </span>

          <span class="value">
            ${esc(
              formatValue(
                drift?.forecast_horizon
              )
            )}
          </span>

        </div>

      </div>


      ${
        drift?.origin_time_window
          ? `
            <div class="field" style="margin-top:16px">

              <span class="label">
                Hindcast origin window
              </span>

              <span class="value">
                ${esc(
                  drift.origin_time_window
                )}
              </span>

            </div>
          `
          : ""
      }


      ${
        drift?.assumptions?.length
          ? `
            <div class="assumptions">

              <span class="label">
                Model assumptions
              </span>

              <ul class="assumptions-list">

                ${drift.assumptions
                  .map(
                    (item) =>
                      `<li>${esc(item)}</li>`
                  )
                  .join("")}

              </ul>

            </div>
          `
          : ""
      }

    </section>


    <!-- =================================================
         DATA COMPATIBILITY
         ================================================= -->

    <section class="section card">

      <div class="card-heading">

        <h2>
          Data Compatibility
        </h2>

        <span>
          SAR / environmental alignment
        </span>

      </div>


      <div class="data-grid">

        <div class="data-item">

          <span class="label">
            Compatible
          </span>

          <span class="value">
            ${esc(
              boolLabel(
                compatibility?.compatible
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Status
          </span>

          <span class="value">
            ${esc(
              formatValue(
                compatibility?.status_code
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Geographic overlap
          </span>

          <span class="value">
            ${esc(
              formatValue(
                compatibility?.geographic_overlap
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            CRS valid
          </span>

          <span class="value">
            ${esc(
              boolLabel(
                compatibility?.crs_valid
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            Environmental coverage
          </span>

          <span class="value">
            ${esc(
              formatValue(
                compatibility?.environmental_coverage
              )
            )}
          </span>

        </div>


        <div class="data-item">

          <span class="label">
            SAR time window
          </span>

          <span class="value">
            ${esc(
              formatValue(
                compatibility?.sar_time_window
              )
            )}
          </span>

        </div>

      </div>


      ${
        compatibility?.reasons?.length
          ? `
            <div class="assumptions">

              <span class="label">
                Compatibility notes
              </span>

              <ul class="assumptions-list">

                ${compatibility.reasons
                  .map(
                    (item) =>
                      `<li>${esc(item)}</li>`
                  )
                  .join("")}

              </ul>

            </div>
          `
          : ""
      }

    </section>


    <!-- =================================================
         CANDIDATE VESSELS
         ================================================= -->

    <section class="section card">

      <div class="card-heading">

        <h2>
          Candidate Vessels
        </h2>

        <span>
          Evidence-based ranking
        </span>

      </div>


      <div class="table-wrap">

        <table>

          <thead>

            <tr>
              <th>Rank</th>
              <th>Vessel</th>
              <th>MMSI</th>
              <th>Score</th>
            </tr>

          </thead>

          <tbody>

            ${candidateRows}

          </tbody>

        </table>

      </div>

    </section>


    <!-- =================================================
         EVIDENCE SOURCES
         ================================================= -->

    <section class="section card">

      <div class="card-heading">

        <h2>
          Evidence Sources
        </h2>

        <span>
          Data provenance
        </span>

      </div>


      <div class="source-grid">

        ${sourceCards}

      </div>

    </section>


    <!-- =================================================
         LIMITATIONS
         ================================================= -->

    <section class="section card">

      <div class="card-heading">

        <h2>
          Limitations
        </h2>

        <span>
          Interpretation notes
        </span>

      </div>


      ${limitationCards}

      ${
        warningCards
          ? `
            <div style="margin-top:12px">
              ${warningCards}
            </div>
          `
          : ""
      }

    </section>


    <!-- =================================================
         RAW INVESTIGATION EVIDENCE
         ================================================= -->

    <section class="section">

      <details>

        <summary>
          Raw investigation evidence
        </summary>

        <div class="raw-content">

          <pre>${json(
            payload
          )}</pre>

        </div>

      </details>

    </section>


    <!-- =================================================
         FOOTER
         ================================================= -->

    <footer class="report-footer">

      <strong>
        SpillTrace · Marine Intelligence
      </strong>

      <br />

      Investigation-support output generated
      from the evidence available at export time.

      <br />

      Candidate rankings do not constitute
      legal attribution.

    </footer>

  </main>

</body>

</html>`;
}
