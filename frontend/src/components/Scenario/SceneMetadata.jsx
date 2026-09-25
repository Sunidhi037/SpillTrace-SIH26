import Section from "../ui/Section";
import { KV } from "../ui/Feedback";
import SceneSelector from "./SceneSelector";
import { NA, formatUtc } from "../../utils/format";

function valueOrNA(value) {
  return value === undefined || value === null || value === "" ? NA : value;
}

function SceneMetadata({ scene, manifest, loading, scenes, onSelectScene }) {
  const bounds = scene?.bounds ?? manifest?.bounds ?? null;
  const hasBounds = Array.isArray(bounds) && bounds.length === 4;
  const source = valueOrNA(scene?.source);
  const sceneId = valueOrNA(scene?.scene_id);
  const acquisition = formatUtc(scene?.acquisition_start_utc);
  const dataMode = valueOrNA(manifest?.data_mode);
  const georef = scene?.georeferencing_method
    ? `${scene.georeferencing_method}${scene.georeferencing_confidence ? ` · ${scene.georeferencing_confidence}` : ""}`
    : NA;

  return (
    <Section id="scene" title="SCENE INFORMATION" collapsible defaultOpen>
      {loading && <p className="muted">Loading scene metadata…</p>}

      {!loading && !scene && (
        <div className="scene-empty">
          <span className="scene-empty-icon" aria-hidden="true">◌</span>
          <div>
            <strong>Scene metadata unavailable</strong>
            <p>The backend did not return metadata for this scene.</p>
          </div>
        </div>
      )}

      {!loading && scene && (
        <>
          <div className="scene-identity-card">
            <div className="scene-identity-main">
              <span className="scene-overline">SAR scene</span>
              <strong title={sceneId}>{sceneId}</strong>
              <span className="scene-source-line">{source}</span>
            </div>
            <div className="scene-mode-badge" title="Data mode">{dataMode}</div>
          </div>

          <div className="scene-meta-group">
            <div className="scene-meta-group-title">Acquisition</div>
            <div className="scene-meta-grid">
              <KV label="Acquisition time" value={acquisition} />
              <KV label="Source" value={source} />
            </div>
          </div>

          <div className="scene-meta-group">
            <div className="scene-meta-group-title">Geospatial reference</div>
            <div className="scene-meta-grid">
              <KV label="CRS" value={valueOrNA(scene.source_crs)} mono />
              <KV label="Georeferencing" value={georef} />
              <KV
                label="Scene bounds"
                value={
                  hasBounds
                    ? `${Number(bounds[0]).toFixed(2)}, ${Number(bounds[1]).toFixed(2)} → ${Number(bounds[2]).toFixed(2)}, ${Number(bounds[3]).toFixed(2)}`
                    : NA
                }
                wide
                mono={hasBounds}
              />
            </div>
          </div>

          {manifest?.notes && (
            <div className="scene-notes">
              <span className="scene-notes-label">Manifest note</span>
              <p>{manifest.notes}</p>
            </div>
          )}
        </>
      )}

      <SceneSelector
        scenes={scenes}
        selectedSceneId={scene?.scene_id}
        onSelect={onSelectScene}
      />
    </Section>
  );
}

export default SceneMetadata;
