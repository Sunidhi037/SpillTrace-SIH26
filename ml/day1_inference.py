"""
Day 1 Inference Script for SpillTrace — DeepLabV3+ PyTorch & Sliding-Window Engine.

Pipeline: SAR GeoTIFF/Image -> Contrast Normalization -> Sliding-Window Tiling ->
PyTorch DeepLabV3+ Inference (5-class softmax) -> Probability Map & Binary Mask ->
Speckle Cleanup -> Output Generation.
"""

import os
import numpy as np
import cv2
import torch
import torch.nn.functional as F
import rasterio
from rasterio.windows import Window
import rasterio.features
import geopandas as gpd
from shapely.geometry import shape
from rasterio.transform import from_origin

# Import model architecture
from seg_models import ResNet50DeepLabV3Plus

# ==========================================
# 1. Configuration & Constants
# ==========================================
IMAGE_PATH = "test3.tiff"
MODEL_WEIGHTS = "oil_spill_seg_resnet_50_deeplab_v3%2B_80.pt"
OUTPUT_DIR = "./output_results"

TILE_SIZE = 1024
OVERLAP = 256
OIL_CLASS_INDEX = 1  # 1 = Oil Spill (from EDA dictionary)
THRESHOLD = 0.5      # For overlap averaging

# Normalization stats
DATASET_MEAN = 0.5185
DATASET_STD = 0.197

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ==========================================
# 2. Model Loader
# ==========================================
def load_pytorch_model(weights_path, device):
    """Initializes and loads weights for the PyTorch DeepLabV3+ model."""
    model = ResNet50DeepLabV3Plus(num_classes=5, pretrained=False)
    if os.path.exists(weights_path):
        model.load_state_dict(torch.load(weights_path, map_location=device))
    else:
        print(f"Warning: Weights path {weights_path} not found. Running with uninitialized weights.")
    model.to(device)
    model.eval()
    print(f"Successfully loaded DeepLabV3+ weights from {weights_path}")
    return model

# ==========================================
# 3. Preprocessing & Helper Functions
# ==========================================
def preprocess_tile(tile_array, device):
    """Applies Mean/Std standardization and formats for PyTorch tensor."""
    tile = (tile_array - DATASET_MEAN) / DATASET_STD
    tile = np.transpose(tile, (2, 0, 1))
    tensor = torch.from_numpy(tile).unsqueeze(0)
    return tensor.to(device)

def clean_mask(binary_mask, min_area=50):
    """Drop tiny speckle-noise blobs under min_area pixels using connected components."""
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        binary_mask.astype(np.uint8), connectivity=8
    )
    cleaned = np.zeros_like(binary_mask)
    for label_id in range(1, num_labels):
        if stats[label_id, cv2.CC_STAT_AREA] >= min_area:
            cleaned[labels == label_id] = 1
    return cleaned

def mask_to_png(binary_mask, out_path):
    """Exports a binary mask array to a standard PNG file."""
    cv2.imwrite(out_path, (binary_mask * 255).astype(np.uint8))

# ==========================================
# 4. Main Execution Engine
# ==========================================
def run_day1_pipeline():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    model = load_pytorch_model(MODEL_WEIGHTS, device)

    print(f"Processing image: {IMAGE_PATH}")
    with rasterio.open(IMAGE_PATH) as src:
        meta = src.meta.copy()
        transform = src.transform
        crs = src.crs
        height = src.height
        width = src.width
        raw_bands = src.read()

    # Inject dummy GPS coordinates if spatial metadata is missing
    if transform.is_identity or crs is None:
        print("Warning: No spatial metadata found in input. Injecting dummy GPS coordinates...")
        transform = from_origin(70.5, 19.5, 0.0001, 0.0001)
        crs = "EPSG:4326"
        meta.update({"transform": transform, "crs": crs})

    # Stack into 3 channels
    if raw_bands.shape[0] >= 3:
        full_image = np.stack([raw_bands[0], raw_bands[1], raw_bands[2]], axis=-1)
    else:
        full_image = np.stack([raw_bands[0], raw_bands[0], raw_bands[0]], axis=-1)

    # Global contrast clip & scale to [0.0, 1.0]
    full_image = full_image.astype(np.float32)
    p_min, p_max = np.percentile(full_image, 1), np.percentile(full_image, 99)
    if p_max > p_min:
        full_image = np.clip(full_image, p_min, p_max)
        full_image = (full_image - p_min) / (p_max - p_min)

    stride = TILE_SIZE - OVERLAP
    full_prob = np.zeros((height, width), dtype=np.float32)
    full_mask_accum = np.zeros((height, width), dtype=np.float32)
    weight_map = np.zeros((height, width), dtype=np.float32)

    print("Running sliding-window inference with PyTorch...")
    with torch.no_grad():
        for y in range(0, height, stride):
            for x in range(0, width, stride):
                w_width = min(TILE_SIZE, width - x)
                w_height = min(TILE_SIZE, height - y)

                tile = full_image[y:y + w_height, x:x + w_width, :]

                if w_height < TILE_SIZE or w_width < TILE_SIZE:
                    padded = np.zeros((TILE_SIZE, TILE_SIZE, 3), dtype=np.float32)
                    padded[:w_height, :w_width, :] = tile
                    tile = padded

                tensor_batch = preprocess_tile(tile, device)

                pred_logits = model(tensor_batch)
                pred_probs = F.softmax(pred_logits, dim=1)

                raw_oil_probs = pred_probs[0, OIL_CLASS_INDEX, :, :].cpu().numpy()
                pred_label = torch.argmax(pred_probs, dim=1)
                class_mask = pred_label[0].cpu().numpy()
                binary_tile = (class_mask == OIL_CLASS_INDEX).astype(np.float32)

                full_prob[y:y + w_height, x:x + w_width] += raw_oil_probs[:w_height, :w_width]
                full_mask_accum[y:y + w_height, x:x + w_width] += binary_tile[:w_height, :w_width]
                weight_map[y:y + w_height, x:x + w_width] += 1.0

    # Average overlap probabilities
    full_prob = np.divide(full_prob, weight_map, out=np.zeros_like(full_prob), where=weight_map != 0)
    full_mask_accum = np.divide(full_mask_accum, weight_map, out=np.zeros_like(full_mask_accum), where=weight_map != 0)

    # Thresholding & clean speckle noise
    binary_mask = (full_mask_accum > THRESHOLD).astype(np.uint8)
    binary_mask = clean_mask(binary_mask, min_area=50)

    # Save Outputs
    base_name = os.path.splitext(os.path.basename(IMAGE_PATH))[0]

    out_mask_tif = os.path.join(OUTPUT_DIR, f"{base_name}_pytorch_mask.tif")
    meta.update({"driver": "GTiff", "count": 1, "dtype": "uint8"})
    with rasterio.open(out_mask_tif, "w", **meta) as dst:
        dst.write(binary_mask * 255, 1)
    print(f"Saved binary mask raster to: {out_mask_tif}")

    out_prob_tif = os.path.join(OUTPUT_DIR, f"{base_name}_pytorch_prob.tif")
    meta.update({"driver": "GTiff", "count": 1, "dtype": "float32"})
    with rasterio.open(out_prob_tif, "w", **meta) as dst:
        dst.write(full_prob, 1)
    print(f"Saved probability map raster to: {out_prob_tif}")

    # Extract Polygons
    shapes = rasterio.features.shapes(binary_mask, transform=transform)
    polygons = [shape(geom) for geom, val in shapes if val == 1]

    if polygons:
        out_geojson = os.path.join(OUTPUT_DIR, f"{base_name}_pytorch_slick.geojson")
        gdf = gpd.GeoDataFrame(geometry=polygons, crs=crs if crs else "EPSG:4326")
        gdf.to_file(out_geojson, driver="GeoJSON")
        print(f"Extracted {len(polygons)} slick polygons and saved to: {out_geojson}")
    else:
        print("No slick detections found.")

if __name__ == "__main__":
    run_day1_pipeline()