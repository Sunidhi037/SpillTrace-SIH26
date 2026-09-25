import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { detectSpill, getApiError, uploadSpill } from "../services/api";

import {
  featureCount,
  getGeoJSONCentroid,
  normalizeDetectionGeometry,
  saveInvestigationData,
} from "../utils/investigation";
import { NA, formatKm2, formatLatLon } from "../utils/format";

import WorkflowSteps from "../components/Upload/WorkflowSteps";
import { ErrorNotice, KV, LoadingNotice } from "../components/ui/Feedback";

const MAX_MB = 250;
const AUTO_OPEN_DELAY_MS = 1600;

/*
 * Flow (matches app/api/routes/spills.py):
 *   1. POST /api/spills/upload          -> { spill_id, ... }
 *   2. POST /api/spills/{spill_id}/detect -> { status, geometry, area_sq_km, ... }
 *   3. navigate(`/investigation/${spill_id}`)   (spill_id from step 1, never the filename)
 */

function Upload() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState("");

  const [detecting, setDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [detectionError, setDetectionError] = useState("");

  const spillId = uploadResult?.spill_id || null;
  const detectionGeojson = detectionResult ? normalizeDetectionGeometry(detectionResult) : null;
  const slickCount = featureCount(detectionGeojson);
  const detectionFailed = detectionResult?.status === "detection_failed";
  const detected = !!detectionResult && !detectionFailed;

  const goToInvestigation = () => {
    if (spillId) navigate(`/investigation/${encodeURIComponent(spillId)}`);
  };

  // A successful detection with slick geometry opens the investigation
  // automatically after a brief confirmation.
  useEffect(() => {
    if (!detected || slickCount === 0 || !spillId) return undefined;
    const t = setTimeout(
      () => navigate(`/investigation/${encodeURIComponent(spillId)}`),
      AUTO_OPEN_DELAY_MS
    );
    return () => clearTimeout(t);
  }, [detected, slickCount, spillId, navigate]);

  const resetAll = () => {
    setSelectedFile(null);
    setFileError("");
    setUploadResult(null);
    setUploadError("");
    setDetectionResult(null);
    setDetectionError("");
  };

  const acceptFile = (file) => {
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

    resetAll();
    setSelectedFile(file);
  };

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

  /* ------------------------------- phases ------------------------------ */

  let phase = "select";
  if (detected) phase = "detected";
  else if (detecting) phase = "detecting";
  else if (spillId) phase = "uploaded";
  else if (uploading) phase = "uploading";
  else if (selectedFile) phase = "ready";

  const activeStep = phase === "detected" ? 3 : spillId || phase === "detecting" ? 2 : 1;

  const centroid = detectionGeojson ? getGeoJSONCentroid(detectionGeojson) : null;

  return (
    <section className="upload-page">
      <div className="upload-intro">
        <p className="eyebrow">START INVESTIGATION</p>
        <WorkflowSteps active={activeStep} />
      </div>

      <div className="upload-card">
        {/* ---------------------------- STEP 1 ---------------------------- */}
        {(phase === "select" || phase === "ready" || phase === "uploading") && (
          <>
            <p className="eyebrow center">SAR SCENE INGESTION</p>
            <h1>01 &nbsp;Upload SAR scene</h1>
            <p className="upload-lead">
              Upload the SAR GeoTIFF that will be analyzed for potential marine oil-spill
              signatures.
            </p>

            {!selectedFile && (
              <div
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  acceptFile(e.dataTransfer.files?.[0]);
                }}
              >
                <span className="dropzone-icon" aria-hidden="true">↑</span>
                <strong>Drop GeoTIFF here</strong>
                <span className="dropzone-or">or</span>
                <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
                  Choose SAR file
                </button>
                <small>.TIF / .TIFF · up to {MAX_MB} MB</small>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              hidden
              accept=".tif,.tiff,image/tiff"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            {fileError && <ErrorNotice title="INVALID FILE" message={fileError} />}

            {selectedFile && (
              <div className="file-summary">
                <div>
                  <span className="kv-label">SAR SCENE</span>
                  <strong className="file-name">{selectedFile.name}</strong>
                  <small>GeoTIFF · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</small>
                </div>
                <span className="badge badge-green">READY FOR UPLOAD</span>
              </div>
            )}

            {uploading && <LoadingNotice title="Uploading SAR scene…" />}

            {uploadError && (
              <ErrorNotice
                title="UPLOAD FAILED"
                message="The SAR scene could not be uploaded."
                reason={uploadError}
                onRetry={handleUpload}
              />
            )}

            {selectedFile && (
              <div className="upload-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={handleUpload} disabled={uploading}>
                  {uploading ? "UPLOADING…" : "UPLOAD SAR SCENE"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={resetAll} disabled={uploading}>
                  Change file
                </button>
              </div>
            )}
          </>
        )}

        {/* ---------------------------- STEP 2 ---------------------------- */}
        {phase === "uploaded" && (
          <>
            <p className="eyebrow center">SAR SCENE READY</p>
            <h1>02 &nbsp;Detect</h1>
            <p className="upload-lead">Run the spill detector on the uploaded SAR scene.</p>

            <div className="file-summary">
              <div>
                <span className="kv-label">SAR SCENE</span>
                <strong className="file-name">{selectedFile?.name || uploadResult?.filename}</strong>
                <small className="ok-text">✓ Uploaded successfully</small>
              </div>
              <span className="badge badge-cyan">UPLOADED</span>
            </div>

            {detectionError && (
              <ErrorNotice
                title="DETECTION FAILED"
                message="The SAR scene could not be processed."
                reason={detectionError}
                onRetry={handleDetect}
              />
            )}
            {detectionFailed && (
              <ErrorNotice
                title="DETECTION FAILED"
                message="The SAR scene could not be processed."
                reason={detectionResult?.message}
                onRetry={handleDetect}
              />
            )}

            <div className="upload-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={handleDetect}>
                RUN SPILL DETECTION
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetAll}>
                Start over
              </button>
            </div>
          </>
        )}

        {phase === "detecting" && (
          <>
            <p className="eyebrow center">DETECTING SPILL</p>
            <h1>02 &nbsp;Detect</h1>
            <LoadingNotice
              title="Running spill detection…"
              lines={[
                "Analyzing SAR scene…",
                "Extracting potential slick geometry…",
                "Generating detection result…",
              ]}
            />
            <p className="hint center">Detection runs on the backend and can take a while for large scenes.</p>
          </>
        )}

        {/* ---------------------------- STEP 3 ---------------------------- */}
        {phase === "detected" && (
          <>
            <p className="eyebrow center">DETECTION COMPLETE</p>
            <h1>{slickCount > 0 ? "Potential slick detected" : "No slick above threshold"}</h1>
            <p className="upload-lead">
              {slickCount > 0
                ? "Opening the investigation workspace…"
                : detectionResult?.message || "The detector found no slick geometry in this scene."}
            </p>

            <div className="kv-grid kv-grid-3">
              <KV label="Area" value={formatKm2(detectionResult?.area_sq_km)} />
              <KV label="Centroid (lat, lon)" value={formatLatLon(centroid)} mono />
              <KV label="Confidence" value={NA} />
            </div>

            <div className="upload-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={goToInvestigation}>
                OPEN INVESTIGATION →
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetAll}>
                Upload another scene
              </button>
            </div>
          </>
        )}
      </div>

      <p className="upload-footnote">
        Candidate rankings support investigation and do not constitute legal attribution.
      </p>
    </section>
  );
}

export default Upload;
