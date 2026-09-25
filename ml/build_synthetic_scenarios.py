"""
Synthetic AIS Demonstration Scenario Generator for SpillTrace SIH 2026.
Builds isolated demonstration scenarios for all SAR images in data/sar/.
"""

import json
import os
import math
import random
from pathlib import Path
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import rasterio
import torch
import cv2
from shapely.geometry import shape, mapping, Polygon, LineString, Point
from shapely.ops import unary_union

# Import existing ML inference engine module safely
from ml.day1_inference import process_sar_scene

DISCLOSURE_STATEMENT = (
    "Synthetic AIS Demonstration Scenario. Candidate rankings demonstrate "
    "the explainable algorithm and are not real-world vessel attribution."
)

SAR_DIR = Path("backend/data/sar")
OUTPUT_BASE_DIR = Path("ml/synthetic_demo_outputs")
MANIFEST_DIR = Path("data/manifests")

OUTPUT_BASE_DIR.mkdir(parents=True, exist_ok=True)
MANIFEST_DIR.mkdir(parents=True, exist_ok=True)


def derive_scenario_id(filepath: Path) -> str:
    stem_upper = filepath.stem.upper()
    return f"SPILL_SYNTHETIC_DEMO_{stem_upper}"


# ==========================================
# STEP 1: TIFF Inspection
# ==========================================
def inspect_tiff(tiff_path: Path) -> dict:
    with rasterio.open(tiff_path) as src:
        meta = src.meta.copy()
        tags = src.tags()
        
        # Check acquisition timestamps in tags
        acq_start = tags.get("ACQUISITION_START_TIME") or tags.get("ACQUISITION_TIME")
        acq_end = tags.get("ACQUISITION_END_TIME")
        
        verified_ts = bool(acq_start)
        
        crs_str = str(src.crs) if src.crs else None
        has_georef = not src.transform.is_identity and src.crs is not None
        
        bounds_native = list(src.bounds) if src.bounds else None
        
        return {
            "input_file": str(tiff_path),
            "file_size_bytes": tiff_path.stat().st_size,
            "raster_width": src.width,
            "raster_height": src.height,
            "band_count": src.count,
            "raster_crs": crs_str,
            "raster_transform": [src.transform.a, src.transform.b, src.transform.c,
                                src.transform.d, src.transform.e, src.transform.f],
            "bounds_native_crs": bounds_native,
            "bounds_epsg4326_when_valid": bounds_native if crs_str == "EPSG:4326" else None,
            "nodata": src.nodata,
            "available_tags": tags,
            "acquisition_start_utc": acq_start,
            "acquisition_end_utc": acq_end,
            "timestamp_source_verified": verified_ts,
            "timestamp_source": "SAR_metadata" if verified_ts else "scenario-configured-for-synthetic-AIS-demo",
            "georeferencing_status": "VALID" if has_georef else "UNVERIFIED_OR_MISSING",
            "georeferencing_notes": "Standard CRS present" if has_georef else "Spatial transform is identity or CRS unassigned"
        }


# ==========================================
# STEP 3: Drift Corridor Generation
# ==========================================
def generate_drift_corridor(slick_geojson_path: str, scenario_id: str, seed: int, base_time: datetime) -> tuple[dict, dict]:
    random.seed(seed)
    np.random.seed(seed)
    
    with open(slick_geojson_path, "r", encoding="utf-8") as f:
        slick_data = json.load(f)
        
    features = slick_data.get("features", [])
    if not features:
        return None, None
        
    polygons = [shape(f["geometry"]) for f in features]
    union_slick = unary_union(polygons)
    centroid = union_slick.centroid
    
    # Drift parameters
    wind_speed_knots = 12.5
    wind_dir_deg = 225.0  # SW wind pushing NE
    current_speed_knots = 0.8
    current_dir_deg = 180.0
    drift_hours = 6.0
    uncertainty_radius_m = 1500.0
    
    # Calculate drift vector (in degrees lat/lon approx)
    # 1 knot ~ 1.852 km/h
    total_drift_km = ((wind_speed_knots * 0.03) + current_speed_knots) * 1.852 * drift_hours
    km_per_deg_lat = 111.0
    km_per_deg_lon = 111.0 * math.cos(math.radians(centroid.y))
    
    # Backwards drift origin calculation
    backwards_angle_rad = math.radians((wind_dir_deg + 180.0) % 360)
    d_lon = (total_drift_km * math.sin(backwards_angle_rad)) / km_per_deg_lon
    d_lat = (total_drift_km * math.cos(backwards_angle_rad)) / km_per_deg_lat
    
    origin_lon = centroid.x + d_lon
    origin_lat = centroid.y + d_lat
    
    # Build origin corridor polygon (ellipse/buffer around origin)
    buf_deg_lon = (uncertainty_radius_m / 1000.0) / km_per_deg_lon
    buf_deg_lat = (uncertainty_radius_m / 1000.0) / km_per_deg_lat
    
    origin_point = Point(origin_lon, origin_lat)
    corridor_poly = origin_point.buffer(max(buf_deg_lon, buf_deg_lat))
    
    corridor_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "scenario_id": scenario_id,
                    "type": "drift_origin_corridor",
                    "uncertainty_radius_m": uncertainty_radius_m
                },
                "geometry": mapping(corridor_poly)
            }
        ]
    }
    
    origin_start = base_time - timedelta(hours=drift_hours + 1)
    origin_end = base_time - timedelta(hours=drift_hours - 1)
    
    drift_meta = {
        "spill_id": scenario_id,
        "data_mode": "TEST_FIXTURE",
        "scenario_label": "Synthetic AIS Demonstration Scenario",
        "ais_data_origin": "SYNTHETIC",
        "environmental_mode": "analyst-parameter-driven",
        "wind_current_source": "analyst-configured parameters",
        "timestamp_source_verified": False,
        "real_world_attribution_claim_allowed": False,
        "random_seed": seed,
        "wind_speed_knots": wind_speed_knots,
        "wind_direction_degrees": wind_dir_deg,
        "current_speed_knots": current_speed_knots,
        "current_direction_degrees": current_dir_deg,
        "origin_window_start_utc": origin_start.isoformat(),
        "origin_window_end_utc": origin_end.isoformat(),
        "uncertainty_radius_m": uncertainty_radius_m,
        "origin_corridor_path": f"ml/synthetic_demo_outputs/{scenario_id}/origin_corridor.geojson",
        "limitations": [
            "Wind/current forcing is analyst-parameter-driven.",
            "Synthetic AIS tracks are used only for algorithm demonstration.",
            "This is not independently verified real-world SAR-to-vessel attribution."
        ]
    }
    
    return corridor_geojson, drift_meta


# ==========================================
# STEP 4: Synthetic AIS Track Generation
# ==========================================
def generate_synthetic_ais(scenario_id: str, corridor_geojson: dict, seed: int, base_time: datetime) -> tuple[pd.DataFrame, dict]:
    random.seed(seed)
    np.random.seed(seed)
    
    corridor_shape = shape(corridor_geojson["features"][0]["geometry"])
    c_lon, c_lat = corridor_shape.centroid.x, corridor_shape.centroid.y
    
    num_vessels = 18
    track_rows = []
    geojson_features = []
    
    vessel_patterns = [
        ("corridor_intersecting_track", 4),
        ("nearby_late_track", 4),
        ("timely_far_track", 3),
        ("reduced_continuity_track", 3),
        ("non_intersecting_track", 4)
    ]
    
    vessel_idx = 1
    for pattern_type, count in vessel_patterns:
        for _ in range(count):
            mmsi = f"999{seed:03d}{vessel_idx:03d}"
            vessel_name = f"DEMO_VESSEL_{vessel_idx:02d}"
            vessel_type = random.choice(["Cargo", "Tanker", "Tug", "Passenger"])
            
            num_points = random.randint(8, 12)
            if pattern_type == "reduced_continuity_track":
                num_points = 5
                
            # Base start timestamp around drift window
            start_ts = base_time - timedelta(hours=random.uniform(5.0, 8.0))
            
            # Start position trajectory generation based on pattern
            if pattern_type == "corridor_intersecting_track":
                start_x, start_y = c_lon - 0.15, c_lat - 0.15
                heading = 45.0
            elif pattern_type == "nearby_late_track":
                start_x, start_y = c_lon - 0.05, c_lat + 0.10
                heading = 120.0
                start_ts += timedelta(hours=3.5)  # Late arrival
            elif pattern_type == "timely_far_track":
                start_x, start_y = c_lon + 0.35, c_lat + 0.35
                heading = 210.0
            elif pattern_type == "reduced_continuity_track":
                start_x, start_y = c_lon - 0.10, c_lat - 0.05
                heading = 60.0
            else:  # non_intersecting_track
                start_x, start_y = c_lon - 0.40, c_lat - 0.40
                heading = 270.0
                
            sog = round(random.uniform(10.0, 16.0), 1)
            cog = heading
            
            track_coords = []
            
            for pt_i in range(num_points):
                obs_time = start_ts + timedelta(minutes=pt_i * 20)
                
                # Advance coordinates along heading
                distance_deg = (sog * 1.852 * (20 / 60)) / 111.0
                rad = math.radians(heading)
                pt_lon = start_x + (distance_deg * math.sin(rad)) + random.uniform(-0.001, 0.001)
                pt_lat = start_y + (distance_deg * math.cos(rad)) + random.uniform(-0.001, 0.001)
                
                start_x, start_y = pt_lon, pt_lat
                track_coords.append((pt_lon, pt_lat))
                
                track_rows.append({
                    "mmsi": mmsi,
                    "vessel_name": vessel_name,
                    "vessel_type": vessel_type,
                    "observed_at": obs_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "longitude": round(pt_lon, 6),
                    "latitude": round(pt_lat, 6),
                    "sog_knots": sog,
                    "cog_degrees": round(cog, 1),
                    "heading_degrees": round(heading, 1),
                    "track_id": f"TRACK_{mmsi}",
                    "pattern_category": pattern_type,
                    "scenario_id": scenario_id,
                    "is_synthetic": True,
                    "data_mode": "TEST_FIXTURE",
                    "ais_data_origin": "SYNTHETIC",
                    "scenario_label": "Synthetic AIS Demonstration Scenario"
                })
                
            line_feature = {
                "type": "Feature",
                "properties": {
                    "mmsi": mmsi,
                    "vessel_name": vessel_name,
                    "vessel_type": vessel_type,
                    "pattern_category": pattern_type,
                    "scenario_id": scenario_id,
                    "is_synthetic": True,
                    "data_mode": "TEST_FIXTURE",
                    "ais_data_origin": "SYNTHETIC",
                    "scenario_label": "Synthetic AIS Demonstration Scenario",
                    "point_count": len(track_coords)
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": track_coords
                }
            }
            geojson_features.append(line_feature)
            vessel_idx += 1
            
    df_tracks = pd.DataFrame(track_rows)
    df_tracks = df_tracks.sort_values(by=["mmsi", "observed_at"]).reset_index(drop=True)
    
    ais_geojson = {
        "type": "FeatureCollection",
        "features": geojson_features
    }
    
    ais_manifest = {
        "spill_id": scenario_id,
        "data_mode": "TEST_FIXTURE",
        "scenario_label": "Synthetic AIS Demonstration Scenario",
        "ais_data_origin": "SYNTHETIC",
        "disclosure": DISCLOSURE_STATEMENT,
        "random_seed": seed,
        "vessel_count": num_vessels,
        "total_point_count": len(df_tracks),
        "pattern_distribution": {k: int(v) for k, v in pd.Series([r["pattern_category"] for r in track_rows if r["observed_at"] == track_rows[0]["observed_at"]]).value_counts().items()}
    }
    
    return df_tracks, ais_geojson, ais_manifest


# ==========================================
# MAIN EXECUTION ENGINE
# ==========================================
def main():
    tiff_files = sorted(list(SAR_DIR.glob("*.tiff")))
    print(f"Found {len(tiff_files)} TIFF images in {SAR_DIR}")
    
    summary_handoff = []
    
    for idx, tiff_path in enumerate(tiff_files, start=1):
        scenario_id = derive_scenario_id(tiff_path)
        out_dir = OUTPUT_BASE_DIR / scenario_id
        out_dir.mkdir(parents=True, exist_ok=True)
        
        seed = 42 + idx
        base_demo_time = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
        
        print(f"\nProcessing [{scenario_id}] from {tiff_path}...")
        
        # 1. Inspect TIFF
        tiff_meta = inspect_tiff(tiff_path)
        with open(out_dir / "sar_input_metadata.json", "w", encoding="utf-8") as f:
            json.dump(tiff_meta, f, indent=2)
            
        # 2. Run SAR Detection Engine
        sar_result = process_sar_scene(str(tiff_path), scene_id=scenario_id)
        
        geojson_artifact = sar_result.get("artifacts", {}).get("geojson")
        has_valid_slick = geojson_artifact is not None and os.path.exists(geojson_artifact)
        
        slick_geometry_path = f"ml/synthetic_demo_outputs/{scenario_id}/slick_geometry.geojson" if has_valid_slick else None
        
        # Copy/save slick geometry locally to output folder
        if has_valid_slick:
            with open(geojson_artifact, "r", encoding="utf-8") as f_in:
                slick_data = json.load(f_in)
            with open(out_dir / "slick_geometry.geojson", "w", encoding="utf-8") as f_out:
                json.dump(slick_data, f_out, indent=2)
                
        slick_meta = {
            "spill_id": scenario_id,
            "input_sar_path": str(tiff_path),
            "data_mode": "TEST_FIXTURE",
            "scenario_label": "Synthetic AIS Demonstration Scenario",
            "ais_data_origin": "SYNTHETIC",
            "synthetic_data_disclosure_required": True,
            "timestamp_source_verified": tiff_meta["timestamp_source_verified"],
            "georeferencing_independently_verified": False,
            "real_world_attribution_claim_allowed": False,
            "output_crs": "EPSG:4326",
            "detector_name": sar_result["metadata"]["detector_name"],
            "model_name": sar_result["metadata"]["model_name"],
            "model_status": sar_result["status"],
            "oil_class_index": sar_result["metadata"]["oil_class_index"],
            "classification_method": "DeepLabV3+ Sliding Window Softmax",
            "probability_threshold": sar_result["metadata"]["probability_threshold"],
            "geometry_status": "VALID" if has_valid_slick else "NO_VALID_SLICK_GEOMETRY",
            "limitations": [DISCLOSURE_STATEMENT]
        }
        
        with open(out_dir / "slick_geometry_metadata.json", "w", encoding="utf-8") as f:
            json.dump(slick_meta, f, indent=2)
            
        if not has_valid_slick:
            print(f"Skipping drift/AIS for {scenario_id}: NO_VALID_SLICK_GEOMETRY")
            compat_report = {
                "spill_id": scenario_id,
                "data_mode": "TEST_FIXTURE",
                "technical_ranking_demo_eligible": False,
                "real_world_attribution_eligible": False,
                "candidate_ranking_enabled": "pending_backend_contract",
                "compatibility_state": "test_fixture_pending_backend_policy",
                "blocking_or_limitation_reasons": ["NO_VALID_SLICK_GEOMETRY"]
            }
            with open(MANIFEST_DIR / f"{scenario_id}_compatibility_report.json", "w") as f:
                json.dump(compat_report, f, indent=2)
            continue
            
        # 3. Generate Drift Corridor
        corridor_geojson, drift_meta = generate_drift_corridor(
            str(out_dir / "slick_geometry.geojson"), scenario_id, seed, base_demo_time
        )
        with open(out_dir / "origin_corridor.geojson", "w", encoding="utf-8") as f:
            json.dump(corridor_geojson, f, indent=2)
        with open(out_dir / "drift_metadata.json", "w", encoding="utf-8") as f:
            json.dump(drift_meta, f, indent=2)
            
        # 4. Generate Synthetic AIS
        df_ais, ais_geojson, ais_manifest = generate_synthetic_ais(
            scenario_id, corridor_geojson, seed, base_demo_time
        )
        
        df_ais.to_parquet(out_dir / "synthetic_ais_tracks.parquet", index=False)
        with open(out_dir / "synthetic_ais_tracks.geojson", "w", encoding="utf-8") as f:
            json.dump(ais_geojson, f, indent=2)
        with open(out_dir / "synthetic_ais_manifest.json", "w", encoding="utf-8") as f:
            json.dump(ais_manifest, f, indent=2)
            
        # 5. Manifests
        scenario_manifest = {
            "spill_id": scenario_id,
            "data_mode": "TEST_FIXTURE",
            "scenario_label": "Synthetic AIS Demonstration Scenario",
            "ais_data_origin": "SYNTHETIC",
            "synthetic_data_disclosure_required": True,
            "timestamp_source_verified": tiff_meta["timestamp_source_verified"],
            "georeferencing_independently_verified": False,
            "environmental_mode": "analyst-parameter-driven",
            "real_world_attribution_claim_allowed": False,
            "sar_input_path": str(tiff_path),
            "slick_geometry_path": str(out_dir / "slick_geometry.geojson"),
            "drift_metadata_path": str(out_dir / "drift_metadata.json"),
            "origin_corridor_path": str(out_dir / "origin_corridor.geojson"),
            "synthetic_ais_parquet_path": str(out_dir / "synthetic_ais_tracks.parquet"),
            "synthetic_ais_geojson_path": str(out_dir / "synthetic_ais_tracks.geojson")
        }
        
        compat_report = {
            "spill_id": scenario_id,
            "data_mode": "TEST_FIXTURE",
            "technical_ranking_demo_eligible": True,
            "real_world_attribution_eligible": False,
            "candidate_ranking_enabled": "pending_backend_contract",
            "compatibility_state": "test_fixture_pending_backend_policy",
            "blocking_or_limitation_reasons": [
                "AIS tracks are synthetic demonstration data.",
                "SAR timestamp may be unverified unless extracted from source metadata.",
                "Environmental forcing is analyst-parameter-driven.",
                "This scenario is not valid for real-world vessel attribution."
            ]
        }
        
        with open(MANIFEST_DIR / f"{scenario_id}_scenario_manifest.json", "w") as f:
            json.dump(scenario_manifest, f, indent=2)
        with open(MANIFEST_DIR / f"{scenario_id}_compatibility_report.json", "w") as f:
            json.dump(compat_report, f, indent=2)
            
        # README.md
        readme_content = f"""# {scenario_id}

> **Disclosure**: {DISCLOSURE_STATEMENT}

## Scenario Overview
- **Input SAR Path**: `{tiff_path}`
- **Timestamp Verified**: `{tiff_meta['timestamp_source_verified']}`
- **Georeferencing Status**: `{tiff_meta['georeferencing_status']}`
- **Detector Status**: `{sar_result['status']}`
- **Vessel Count**: `{ais_manifest['vessel_count']}`
- **Total Track Points**: `{ais_manifest['total_point_count']}`

## Handoff Paths
- **Slick Geometry**: `ml/synthetic_demo_outputs/{scenario_id}/slick_geometry.geojson`
- **Origin Corridor**: `ml/synthetic_demo_outputs/{scenario_id}/origin_corridor.geojson`
- **Synthetic AIS Parquet**: `ml/synthetic_demo_outputs/{scenario_id}/synthetic_ais_tracks.parquet`
- **Synthetic AIS GeoJSON**: `ml/synthetic_demo_outputs/{scenario_id}/synthetic_ais_tracks.geojson`
- **Scenario Manifest**: `data/manifests/{scenario_id}_scenario_manifest.json`
- **Compatibility Report**: `data/manifests/{scenario_id}_compatibility_report.json`
"""
        with open(out_dir / "README.md", "w", encoding="utf-8") as f:
            f.write(readme_content)
            
        summary_handoff.append({
            "scenario_id": scenario_id,
            "sar_input_path": str(tiff_path),
            "timestamp_verified": tiff_meta["timestamp_source_verified"],
            "vessel_count": ais_manifest["vessel_count"],
            "point_count": ais_manifest["total_point_count"]
        })
        
    print("\nGeneration completed successfully.")

if __name__ == "__main__":
    main()
