/**
 * Small scene switcher. Only rendered when the backend lists more than one
 * scene, so it stays out of the way in the common case.
 */
function SceneSelector({ scenes, selectedSceneId, onSelect }) {
  if (!Array.isArray(scenes) || scenes.length < 2) return null;

  return (
    <label className="field scene-selector">
      <span>Switch scene</span>
      <select value={selectedSceneId || ""} onChange={(e) => onSelect(e.target.value)}>
        {scenes.map((scene) => (
          <option key={scene.scene_id} value={scene.scene_id}>
            {scene.scene_id} — {scene.source || "Unknown source"}
          </option>
        ))}
      </select>
    </label>
  );
}

export default SceneSelector;
