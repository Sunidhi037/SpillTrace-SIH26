"""
Day 3 Cleanup & Postprocessing Script for SpillTrace.

Pipeline: SAR GeoTIFF & Probability Maps -> Threshold Sweep Experiment ->
Morphological Cleanup (Opening, Closing, Hole Filling) -> Component Size Filtering ->
Orientation & GeoJSON Feature Extraction -> Adaptive-Threshold Baseline Comparison.
"""

import os
import cv2
import json
import math
import numpy as np
import rasterio
import rasterio.features
import geopandas as gpd
from shapely.geometry import shape
from scipy.ndimage import binary_fill_holes

# ==========================================
# 1. Configuration & Constants
# ==========================================
SAR_PATH = "test3.tiff"
PROB_PATH = "output_results/test3_pytorch_prob.tif"
ARGMAX_OIL_PATH = "audit_outputs/oil_argmax_mask.png"
LOOK_ALIKE_PATH = "audit_outputs/look_alike_mask.png"
DAY3_DIR = "day3_outputs"
OUTPUT_GEOJSON = "output_results/test3_cleaned_slicks.geojson"

os.makedirs(DAY3_DIR, exist_ok=True)
os.makedirs("output_results", exist_ok=True)

MIN_BLOB_AREA = 100
SELECTED_THRESHOLD = 0.30

# ==========================================
# 2. Geometry Helper: Orientation
# ==========================================
def calculate_orientation(poly) -> float:
    """Calculates the orientation angle of the minimum rotated rectangle enclosing the polygon."""
    mrr = poly.minimum_rotated_rectangle
    coords = list(mrr.exterior.coords)
    if len(coords) < 4: 
        return 0.0
        
    dx1, dy1 = coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]
    dx2, dy2 = coords[2][0] - coords[1][0], coords[2][1] - coords[1][1]
    
    len1, len2 = math.hypot(dx1, dy1), math.hypot(dx2, dy2)
    angle = math.degrees(math.atan2(dy1, dx1)) if len1 >= len2 else math.degrees(math.atan2(dy2, dx2))
    return round(angle % 180, 2)

# ==========================================
# 3. Morphology & Cleanup Engine
# ==========================================
def clean_mask(binary_mask: np.ndarray, min_area: int) -> np.ndarray:
    """Applies complete morphological cleanup: hole filling, closing, and area filtering."""
    binary_mask = (binary_mask > 0).astype(np.uint8)

    # A. Fill internal voids/holes completely
    filled_mask = binary_fill_holes(binary_mask).astype(np.uint8)

    # B. Morphological closing to seal boundary fractures
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed_mask = cv2.morphologyEx(filled_mask, cv2.MORPH_CLOSE, kernel_close)

    # C. Remove small noise blobs by area threshold
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(closed_mask, connectivity=8)
    cleaned_mask = np.zeros_like(closed_mask)
    
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            cleaned_mask[labels == i] = 1
            
    return cleaned_mask

# ==========================================
# 4. Main Execution Pipeline
# ==========================================
def run_day3_pipeline():
    print("Loading datasets for Day 3 cleanup and postprocessing...")
    with rasterio.open(SAR_PATH) as src:
        sar_img = src.read(1)
        transform = src.transform
        crs = src.crs
        img_shape = (src.height, src.width)
        acquisition_time = src.tags().get("ACQUISITION_TIME", "2026-09-02T00:00:00Z")
        sar_base = cv2.normalize(sar_img, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        sar_bgr = cv2.cvtColor(sar_base, cv2.COLOR_GRAY2BGR)

    with rasterio.open(PROB_PATH) as src:
        oil_probs = src.read(1)

    # Read optional class masks safely if they exist
    argmax_oil_mask = (cv2.imread(ARGMAX_OIL_PATH, cv2.IMREAD_GRAYSCALE) > 127).astype(np.uint8) if os.path.exists(ARGMAX_OIL_PATH) else np.zeros(img_shape, dtype=np.uint8)
    look_alike_mask = (cv2.imread(LOOK_ALIKE_PATH, cv2.IMREAD_GRAYSCALE) > 127).astype(np.uint8) if os.path.exists(LOOK_ALIKE_PATH) else np.zeros(img_shape, dtype=np.uint8)

    # ------------------------------------------
    # A. Threshold Sweep Experiment (0.2, 0.3, 0.4, 0.5)
    # ------------------------------------------
    print("Running confidence threshold sweep...")
    thresholds = [0.20, 0.30, 0.40, 0.50]
    experiment_results = {}

    for t in thresholds:
        t_mask = (oil_probs >= t).astype(np.uint8)
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(t_mask, connectivity=8)
        
        areas = stats[1:, cv2.CC_STAT_AREA] if num_labels > 1 else []
        retained_pixels = int(np.sum(t_mask))
        
        experiment_results[f"threshold_{t}"] = {
            "oil_pixels_retained": retained_pixels,
            "connected_component_count": int(num_labels - 1),
            "total_component_area_px": int(np.sum(areas)) if len(areas) > 0 else 0,
            "largest_component_area_px": int(np.max(areas)) if len(areas) > 0 else 0,
            "mean_probability_inside_mask": float(np.mean(oil_probs[t_mask == 1])) if retained_pixels > 0 else 0.0
        }
        cv2.imwrite(os.path.join(DAY3_DIR, f"pre_cleanup_mask_t{t}.png"), t_mask * 255)

    with open(os.path.join(DAY3_DIR, "threshold_experiment_stats.json"), "w") as f:
        json.dump(experiment_results, f, indent=4)

    # ------------------------------------------
    # B. Apply Morphology to Selected Threshold
    # ------------------------------------------
    print(f"Applying morphology and size filter to selected threshold {SELECTED_THRESHOLD}...")
    raw_selected_mask = (oil_probs >= SELECTED_THRESHOLD).astype(np.uint8)
    final_cleaned_mask = clean_mask(raw_selected_mask, MIN_BLOB_AREA)
    cv2.imwrite(os.path.join(DAY3_DIR, "post_cleanup_mask_final.png"), final_cleaned_mask * 255)

    # ------------------------------------------
    # C. Generate Diagnostic Overlay
    # ------------------------------------------
    print("Generating Day 3 diagnostic overlay...")
    diagnostic_overlay = sar_bgr.copy()
    diagnostic_overlay[look_alike_mask == 1] = [0, 165, 255]  # Orange for look-alike
    diagnostic_overlay[argmax_oil_mask == 1] = [0, 255, 255]  # Yellow for raw argmax
    blended = cv2.addWeighted(sar_bgr, 0.5, diagnostic_overlay, 0.5, 0)

    contours, _ = cv2.findContours(final_cleaned_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(blended, contours, -1, (0, 0, 255), 2)  # Red outline for final cleaned polygons
    cv2.imwrite(os.path.join(DAY3_DIR, "diagnostic_overlay_master.png"), blended)

    # ------------------------------------------
    # D. Adaptive-Threshold Baseline Comparison
    # ------------------------------------------
    print("Running adaptive-threshold baseline comparison...")
    adaptive_baseline = cv2.adaptiveThreshold(
        sar_base, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 5
    )
    cv2.imwrite(os.path.join(DAY3_DIR, "adaptive_baseline_mask.png"), adaptive_baseline)

    adaptive_overlay = sar_bgr.copy()
    adaptive_overlay[adaptive_baseline == 255] = [255, 0, 255]  # Magenta for baseline
    baseline_blended = cv2.addWeighted(sar_bgr, 0.6, adaptive_overlay, 0.4, 0)
    cv2.imwrite(os.path.join(DAY3_DIR, "adaptive_baseline_overlay.png"), baseline_blended)

    # ------------------------------------------
    # E. Geometry & GeoJSON Extraction
    # ------------------------------------------
    print("Extracting physical attributes and exporting cleaned slick geometries...")
    shapes = rasterio.features.shapes(final_cleaned_mask, transform=transform)
    features = []
    slick_id = 1

    for geom, val in shapes:
        if val == 1:
            poly = shape(geom)
            poly_mask = rasterio.features.geometry_mask(
                [poly], transform=transform, invert=True, out_shape=img_shape
            )
            mean_confidence = float(np.mean(oil_probs[poly_mask])) if np.any(poly_mask) else 0.0
            
            area_deg2 = poly.area
            perimeter_deg = poly.length
            area_km2 = area_deg2 * (111.32 ** 2)
            perimeter_m = perimeter_deg * 111320.0
            
            features.append({
                "geometry": poly,
                "slick_id": slick_id,
                "area_km2": round(area_km2, 4),
                "perimeter_m": round(perimeter_m, 2),
                "centroid_lon": round(poly.centroid.x, 5),
                "centroid_lat": round(poly.centroid.y, 5),
                "orientation_deg": calculate_orientation(poly),
                "confidence": round(mean_confidence, 4),
                "acquisition_time_utc": acquisition_time,
                "model_status": "production",
                "detector_name": "SpillTrace DeepLabV3+"
            })
            slick_id += 1

    if features:
        if crs is None:
            crs = "EPSG:4326"
            
        gdf = gpd.GeoDataFrame(features, crs=crs)
        if gdf.crs is not None and gdf.crs != "EPSG:4326":
            gdf = gdf.to_crs("EPSG:4326")
        elif gdf.crs is None:
            gdf.set_crs("EPSG:4326", allow_override=True)
            
        gdf.to_file(OUTPUT_GEOJSON, driver="GeoJSON")
        print(f"Success! {len(features)} clean slicks exported to {OUTPUT_GEOJSON}")
    else:
        print("No slicks remained after cleanup.")

if __name__ == "__main__":
    run_day3_pipeline()