import os
import json
import math
import numpy as np
import rasterio
import rasterio.features
import geopandas as gpd
from shapely.geometry import shape

# --- CONFIGURATION ---
SAR_PATH = "test3.tiff"
CLEAN_MASK_PATH = "day3_outputs/post_cleanup_mask_final.png"
PROB_PATH = "output_results/test3_pytorch_prob.tif"
DAY4_DIR = "day4_outputs"
os.makedirs(DAY4_DIR, exist_ok=True)

# 1. Load Data
# with rasterio.open(SAR_PATH) as src:
#     transform = src.transform
#     crs = src.crs or "EPSG:4326"

with rasterio.open(PROB_PATH) as src:
    transform = src.transform
    crs = src.crs or "EPSG:4326"
    prob_map = src.read(1)
    height, width = prob_map.shape

with rasterio.open(CLEAN_MASK_PATH) as src:
    clean_mask = (src.read(1) > 127).astype(np.uint8)

# 2. Polygonize, Repair, and Extract Physics
features = []
shapes = rasterio.features.shapes(clean_mask, transform=transform)

total_area_km2 = 0
total_perimeter_m = 0

print("Extracting Day 4 geometries and calculating drift physics...")
for i, (geom, val) in enumerate(shapes):
    if val == 1:
        # Repair invalid polygons automatically using buffer(0)
        poly = shape(geom).buffer(0)
        
        if poly.is_empty:
            continue

        # Confidence Masking
        poly_mask = rasterio.features.geometry_mask([poly], transform=transform, invert=True, out_shape=(height, width))
        mean_conf = float(np.mean(prob_map[poly_mask])) if np.any(poly_mask) else 0.0
        
        # Scale conversions (using dummy degrees -> metric approximation)
        area_km2 = poly.area * (111.32 ** 2)
        perimeter_m = poly.length * 111320.0
        
        total_area_km2 += area_km2
        total_perimeter_m += perimeter_m
        
        # Compactness: 4 * pi * Area / Perimeter^2
        area_m2 = area_km2 * 1e6
        compactness = (4 * math.pi * area_m2) / (perimeter_m ** 2) if perimeter_m > 0 else 0

        # Orientation
        mrr = poly.minimum_rotated_rectangle
        coords = list(mrr.exterior.coords)
        angle = 0.0
        if len(coords) >= 4:
            dx1, dy1 = coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]
            dx2, dy2 = coords[2][0] - coords[1][0], coords[2][1] - coords[1][1]
            len1, len2 = math.hypot(dx1, dy1), math.hypot(dx2, dy2)
            angle = math.degrees(math.atan2(dy1, dx1)) if len1 >= len2 else math.degrees(math.atan2(dy2, dx2))

        features.append({
            "slick_id": i + 1,
            "centroid": [round(poly.centroid.x, 6), round(poly.centroid.y, 6)],
            "bounding_box": list(poly.bounds),
            "area_km2": round(area_km2, 4),
            "perimeter_m": round(perimeter_m, 2),
            "orientation": round(angle % 180, 2),
            "compactness": round(compactness, 4),
            "confidence": round(mean_conf, 4),
            "geometry": poly
        })

# 3. Export GeoJSON
if features:
    gdf = gpd.GeoDataFrame(features, crs=crs)
    if gdf.crs != "EPSG:4326":
        gdf = gdf.to_crs("EPSG:4326")
    
    geojson_path = os.path.join(DAY4_DIR, "slick_geometry.geojson")
    gdf.to_file(geojson_path, driver="GeoJSON")
    print(f"Saved {len(features)} validated polygons to {geojson_path}")

# 4. Export Metadata Contract
pixel_count_after = int(np.sum(clean_mask > 0))
pixel_count_before = 159232  # From Day 3 threshold 0.3 data

metadata = {
    "spill_id": "SPILL_TEST3_001",
    "acquisition_start_utc": "2026-09-02T00:00:00Z",
    "acquisition_end_utc": "2026-09-02T00:00:00Z",
    "sar_source": "Sentinel-1",  # Or whichever satellite you downloaded this from
    "source_crs": str(crs),
    "output_crs": "EPSG:4326",
    "georeferencing_method": "injected_coordinates_for_prototype",
    "georeferencing_confidence": "prototype_scale",
    "detector_name": "SpillTrace_Team",
    "model_name": "ResNet50DeepLabV3Plus",
    "checkpoint": "oil_spill_seg_resnet_50_deeplab_v3%2B_80.pt",
    "model_status": "experimental",
    "oil_class_index": 1,
    "classification_method": "pixelwise_argmax_with_threshold",
    "probability_threshold": 0.30,
    "morphology_parameters": "MORPH_OPEN(3x3) -> MORPH_CLOSE(5x5) -> MIN_AREA(100px)",
    "pixel_count_before_cleanup": pixel_count_before,
    "pixel_count_after_cleanup": pixel_count_after,
    "number_of_components": len(features),
    "area_method": "geodesic_approximation",
    "total_area_km2": round(total_area_km2, 4),
    "total_perimeter_m": round(total_perimeter_m, 2)
}

with open(os.path.join(DAY4_DIR, "slick_geometry_metadata.json"), "w") as f:
    json.dump(metadata, f, indent=4)
print("Saved Day 4 metadata contract.")