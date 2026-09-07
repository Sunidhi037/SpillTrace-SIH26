import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  detectSpill,
  getApiError,
  uploadSpill,
} from "../services/api";

import {
  normalizeDetectionGeometry,
  saveInvestigationData,
} from "../utils/investigation";

const MAX_MB = 250;

/*
 * Upload flow (matches app/api/routes/spills.py exactly):
 *
 *   1. POST /api/spills/upload      (multipart/form-data, field name "file")
 *        -> { spill_id, filename, content_type, saved_path, uploaded_at, status }
 *
 *   2. POST /api/spills/{spill_id}/detect   (no body -- file is not re-sent)
 *        -> { spill_id, status, message, geometry, area_sq_km, detected_at }
 *      geometry is double-wrapped: the real GeoJSON FeatureCollection is at
 *      geometry.geojson, not geometry directly (see detectSpill()'s doc
 *      comment in services/api.js) -- normalizeDetectionGeometry() below
 *      already knows to unwrap this.
 *
 *   3. navigate(`/investigation/${spill_id}`)   -- spill_id from step 1's
 *      response, never a scene_id, never the local file name.
 *
 * "Run Detection" is disabled until step 1 has produced a real spill_id.
 */

function Upload() {
  const navigate = useNavigate();

  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState("");

  const [detecting, setDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [detectionError, setDetectionError] = useState("");

  const spillId = uploadResult?.spill_id || null;
  const detectionGeojson = detectionResult
    ? normalizeDetectionGeometry(detectionResult)
    : null;

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const extension = file.name.toLowerCase().split(".").pop();

    if (!["tif", "tiff"].includes(extension)) {
      setSelectedFile(null);
      setFileError("Please select a GeoTIFF file (.tif or .tiff).");
      return;
    }

    if (file.size > MAX_MB * 1024 * 1024) {
      setSelectedFile(null);
      setFileError(`File is larger than ${MAX_MB} MB.`);
      return;
    }

    setSelectedFile(file);
    setFileError("");

    // Picking a new file invalidates any previous upload/detection state.
    setUploadResult(null);
    setUploadError("");
    setDetectionResult(null);
    setDetectionError("");
  };

  /* -------------------------------------------------------------- */
  /* STEP 1 — upload                                                 */
  /* -------------------------------------------------------------- */

  const handleUpload = async () => {
    if (!selectedFile || uploading) return;

    setUploading(true);
    setUploadError("");
    setDetectionResult(null);
    setDetectionError("");

    try {
      const result = await uploadSpill(selectedFile);

      if (!result?.spill_id) {
        throw new Error("Backend did not return a spill_id.");
      }

      setUploadResult(result);

      saveInvestigationData(result.spill_id, {
        upload: result,
        fileName: selectedFile.name,
      });
    } catch (err) {
      setUploadResult(null);
      setUploadError(getApiError(err).message);
    } finally {
      setUploading(false);
    }
  };

  /* -------------------------------------------------------------- */
  /* STEP 2 — detect                                                 */
  /* -------------------------------------------------------------- */

  const handleDetect = async () => {
    if (!spillId || detecting) return;

    setDetecting(true);
    setDetectionError("");

    try {
      const result = await detectSpill(spillId);

      setDetectionResult(result);

      saveInvestigationData(spillId, {
        upload: uploadResult,
        fileName: selectedFile?.name,
        detection: result,
      });
    } catch (err) {
      setDetectionError(getApiError(err).message);
    } finally {
      setDetecting(false);
    }
  };

  const handleGoToInvestigation = () => {
    if (!spillId) return;

    navigate(`/investigation/${encodeURIComponent(spillId)}`);
  };

  return (
    <section className="upload-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">SPILLTRACE / DATA INGESTION</p>

          <h1>Upload SAR Scene</h1>

          <p className="page-description">
            Upload a SAR file, then run detection against it. The file is
            only sent to the backend once — detection runs against the copy
            the backend already saved on disk, not a fresh upload.
          </p>
        </div>
      </div>

      <div className="upload-grid">
        <div className="upload-card">
          <div className="upload-icon">↑</div>

          <h2>1. Select &amp; Upload SAR Image</h2>

          <p>GeoTIFF (.tif / .tiff) is required by the current detector.</p>

          <label className="file-picker">
            <span>{selectedFile ? "Change File" : "Choose GeoTIFF"}</span>

            <input
              type="file"
              accept=".tif,.tiff,image/tiff"
              onChange={handleFileChange}
              disabled={uploading || detecting}
            />
          </label>

          {selectedFile && (
            <div className="selected-file">
              <div>
                <span className="file-label">SELECTED FILE</span>
                <strong>{selectedFile.name}</strong>
                <small>
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </small>
              </div>

              <span className="file-status">
                {spillId ? "UPLOADED" : "READY"}
              </span>
            </div>
          )}

          {fileError && (
            <div className="upload-error">
              <p>{fileError}</p>
            </div>
          )}

          <button
            className="primary-button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading || !!spillId}
          >
            {uploading
              ? "Uploading…"
              : spillId
                ? "Uploaded"
                : "Upload File"}
          </button>

          {uploadError && (
            <div className="upload-error">
              <strong>Upload failed</strong>
              <p>{uploadError}</p>
            </div>
          )}

          {uploadResult && (
            <div className="metadata-item" style={{ marginTop: 12 }}>
              <span>Spill ID</span>
              <strong>{uploadResult.spill_id}</strong>
            </div>
          )}

          <hr style={{ margin: "20px 0", borderColor: "#1c3548" }} />

          <h2>2. Run Detection</h2>

          <p>
            Triggers detection on the file already saved by the backend — no
            file is uploaded again.
          </p>

          <button
            className="primary-button"
            onClick={handleDetect}
            disabled={!spillId || detecting}
            title={
              !spillId
                ? "Upload a file first to get a spill_id."
                : undefined
            }
          >
            {detecting ? "Running detector…" : "Run Detection"}
          </button>

          {!spillId && (
            <p className="upload-note">
              Detect is disabled until upload succeeds and a spill_id is
              available.
            </p>
          )}

          {detectionError && (
            <div className="upload-error">
              <strong>Detection request failed</strong>
              <p>{detectionError}</p>
            </div>
          )}

          {detectionResult && (
            <div className="metric-grid" style={{ marginTop: 12 }}>
              <div>
                <span>Status</span>
                <strong>{detectionResult.status}</strong>
              </div>

              <div>
                <span>Message</span>
                <strong>{detectionResult.message}</strong>
              </div>

              <div>
                <span>Area</span>
                <strong>
                  {detectionResult.area_sq_km != null
                    ? `${Number(detectionResult.area_sq_km).toFixed(2)} km²`
                    : "Not provided by backend"}
                </strong>
              </div>

              <div>
                <span>Detected At</span>
                <strong>
                  {detectionResult.detected_at
                    ? new Date(detectionResult.detected_at).toLocaleString()
                    : "Not provided by backend"}
                </strong>
              </div>

              <div>
                <span>Slick Geometry</span>
                <strong>
                  {detectionGeojson?.features?.length
                    ? `${detectionGeojson.features.length} feature(s) — view on map in the investigation workspace`
                    : "No slick geometry above threshold"}
                </strong>
              </div>
            </div>
          )}

          {spillId && (
            <button
              className="secondary-button"
              onClick={handleGoToInvestigation}
              style={{ marginTop: 12 }}
            >
              Go to Investigation Workspace
            </button>
          )}

          <p className="upload-note">
            Upload → spill_id → POST /api/spills/&#123;spill_id&#125;/detect →
            detection response → investigation workspace.
          </p>
        </div>
      </div>
    </section>
  );
}

export default Upload;
