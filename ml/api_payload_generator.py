"""
API Payload Generator for SpillTrace.

Consolidates backend and partner handoff scripts into a single utility.
Generates structured JSON contracts
"""

import os
import json

# ==========================================
# 1. Configuration & Constants
# ==========================================
OUTPUT_DIR = "output_results"
DAY5_DIR = "day5_outputs"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(DAY5_DIR, exist_ok=True)

# ==========================================
# 2. Backend Handoff Payload
# ==========================================
def generate_backend_handoff():
    print("Generating backend handoff payloads")
    
    # A. Slick Geometry Metadata JSON
    slick_metadata = {
        "spill_id": "SPILL_TEST3_001",
        "detector_name": "SpillTrace DeepLabV3+ Engine",
        "checkpoint": "oil_spill_seg_resnet_50_deeplab_v3+_80.pt",
        "fallback_used": False,
        "probability_threshold": 0.30,
        "pixel_count_after_cleanup": 14520,
        "centroid": [72.55, 18.25],
        "output_crs": "EPSG:4326",
        "class_mapping": {
            "0": "sea_surface",
            "1": "oil_spill",
            "2": "look_alike",
            "3": "ship",
            "4": "land"
        }
    }
    
    path_meta = os.path.join(OUTPUT_DIR, "slick_geometry_metadata.json")
    with open(path_meta, "w") as f:
        json.dump(slick_metadata, f, indent=4)

    # B. Sample Slick Geometry GeoJSON
    slick_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[72.5, 18.2], [72.6, 18.2], [72.6, 18.3], [72.5, 18.3], [72.5, 18.2]]]
                },
                "properties": {
                    "area_km2": 12.4,
                    "perimeter_m": 4500.5,
                    "confidence": 0.88
                }
            }
        ]
    }
    
    path_geojson = os.path.join(OUTPUT_DIR, "slick_geometry.geojson")
    with open(path_geojson, "w") as f:
        json.dump(slick_geojson, f, indent=4)
        
    print(f"Backend handoff files generated in: {OUTPUT_DIR}/")

# ==========================================
# 3.  AIS & Drift Handoff Payload
# ==========================================
def generate_drift_handoff():
    print("Generating AIS drift handoff payloads")
    
    drift_handoff = {
        "module": "SpillTrace Drift & AIS Integration",
        "status": "Ready",
        "engine_version": "v2.1-monte-carlo",
        "associated_files": {
            "origin_corridor": "day5_outputs/origin_corridor.geojson",
            "particle_trajectory": "day5_outputs/particles_trajectory.geojson",
            "drift_metadata": "day5_outputs/drift_metadata.json"
        },
        "integration_notes": "Coordinates mapped to EPSG:4326. Particle positions time-stepped hourly backwards for 12 hours."
    }
    
    path = os.path.join(DAY5_DIR, "day7_hindcast.json")
    with open(path, "w") as f:
        json.dump(drift_handoff, f, indent=4)
        
    print(f" file generated at: {path}")

# ==========================================
# 4. Main Execution Entrypoint
# ==========================================
if __name__ == "__main__":
    print("Executing API Payload Generator...")
    generate_backend_handoff()
    generate_drift_handoff()
    print("All team API handoff payloads successfully created!")