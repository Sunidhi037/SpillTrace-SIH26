import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getScenes, getApiError } from "../services/api";
import { NA, formatUtc } from "../utils/format";

const capabilities = [
  { number: "01", title: "SAR Detection", text: "Ingest a GeoTIFF scene and identify potential slick geometry." },
  { number: "02", title: "Drift Reconstruction", text: "Run hindcast and forecast analysis using the available environmental inputs." },
  { number: "03", title: "AIS Analysis", text: "Load vessel tracks inside the investigation window and map their movement." },
  { number: "04", title: "Evidence Ranking", text: "Compare candidate vessels using spatial, temporal and track evidence." },
];

function Home() {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    getScenes()
      .then((data) => mounted && setScenes(data.scenes || []))
      .catch((err) => mounted && setError(getApiError(err).message))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  return (
    <section className="dashboard dashboard-pro">
      <div className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="hero-dot" /> MARINE INTELLIGENCE PLATFORM · SIH 2026</div>
          <h1>Marine oil-spill investigation,<br /><span>from SAR scene to evidence.</span></h1>
          <p>
            SpillTrace connects satellite imagery, ocean drift modelling and AIS vessel tracks
            into one explainable geospatial investigation workflow.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => navigate("/upload")}>Start New Investigation <span>→</span></button>
            <button className="btn btn-secondary btn-lg" onClick={() => document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" })}>Explore workflow</button>
          </div>
          <div className="hero-note"><span>●</span> Investigation support only · evidence is shown with its available uncertainty.</div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="radar-grid" />
          <div className="radar-ring ring-a" /><div className="radar-ring ring-b" /><div className="radar-ring ring-c" />
          <div className="radar-sweep" />
          <div className="radar-point point-a" /><div className="radar-point point-b" /><div className="radar-point point-c" />
          <div className="visual-caption"><strong>INVESTIGATION CORE</strong><span>SAR · OCEAN · AIS</span></div>
        </div>
      </div>

      <div id="workflow" className="dashboard-section">
        <div className="section-heading">
          <div><p className="eyebrow">INVESTIGATION WORKFLOW</p><h2>One workspace. Every analysis stage.</h2></div>
          <span className="section-index">01 — 04</span>
        </div>
        <div className="capability-grid">
          {capabilities.map((item) => (
            <article className="capability-card" key={item.number}>
              <span className="capability-number">{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="capability-line" />
            </article>
          ))}
        </div>
      </div>

      <div className="dashboard-section scene-section">
        <div className="section-heading">
          <div><p className="eyebrow">AVAILABLE DATA</p><h2>Backend SAR scenes</h2><p className="section-subtitle">Open an existing scene or start a fresh investigation with a new GeoTIFF.</p></div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/upload")}>Upload SAR Scene</button>
        </div>

        {loading && <div className="empty-state"><span className="loading-dot" /> Loading available scenes…</div>}
        {!loading && error && <div className="notice notice-error"><strong>Could not load scenes</strong><div className="notice-reason"><span>Reason</span><code>{error}</code></div></div>}
        {!loading && !error && scenes.length === 0 && (
          <div className="empty-state"><strong>No backend scenes available.</strong><span>Start a new investigation to upload a SAR GeoTIFF.</span></div>
        )}
        {!loading && !error && scenes.length > 0 && (
          <div className="scene-table">
            {scenes.slice(0, 6).map((scene) => (
              <div className="scene-row scene-row-pro" key={scene.scene_id}>
                <div className="scene-main"><span className="scene-status-dot" /><div><span className="mono scene-row-id">{scene.scene_id}</span><strong>{scene.source || NA}</strong></div></div>
                <div className="scene-row-meta"><span>Acquisition</span><strong>{scene.acquisition_start_utc ? formatUtc(scene.acquisition_start_utc) : NA}</strong></div>
                <div className="scene-row-meta"><span>CRS</span><strong>{scene.source_crs || NA}</strong></div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/investigation/${scene.scene_id}`)}>Open →</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-footer-strip">
        <div><strong>SPILLTRACE</strong><span>Marine Intelligence Investigation System</span></div>
        <div><span>PS 26143</span><span>·</span><span>SIH 2026</span></div>
      </div>
    </section>
  );
}

export default Home;
