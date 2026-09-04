"""
Day 5 Drift Engine & Simulation Pipeline for SpillTrace.

Modules:
1. Operational Hindcast (Computes reverse drift from Day 4 slick geometries, 
   generates particle trajectories, corridors, and Pratyush's metadata).
2. Controlled Simulation Validation (Known synthetic source validation and error metrics).
3. Monte Carlo Sensitivity & Reproducibility Analysis (Robustness testing across wind/current/seed variations).
"""

import os
import json
import math
import time
import numpy as np
import rasterio
from geopy.distance import geodesic
from shapely.geometry import LineString, mapping

# ==========================================
# 1. Global Configuration & Constants
# ==========================================
DAY4_GEOJSON_PATH = "day4_outputs/slick_geometry.geojson"
DAY5_DIR = "day5_outputs"

os.makedirs(DAY5_DIR, exist_ok=True)

# ==========================================
# 2. Module 1: Operational Hindcast Pipeline
# ==========================================
def run_operational_hindcast():
    print("\n--- Running Operational Hindcast Pipeline ---")
    
    HINDCAST_HOURS = 12
    TIME_STEP_HOURS = 1
    WIND_SPEED_KNOTS = 15.0
    WIND_DIR_FROM = 270.0  # Blowing FROM West
    CURRENT_SPEED_KNOTS = 1.2
    CURRENT_DIR_TO = 90.0   # Pushing TO East

    WIND_COEFF = 0.03
    CURRENT_COEFF = 1.0
    KNOTS_TO_METERS_PER_HOUR = 1852.0
    UNCERTAINTY_FACTOR = 0.1

    if not os.path.exists(DAY4_GEOJSON_PATH):
        print(f"Warning: {DAY4_GEOJSON_PATH} not found. Using fallback coordinates for hindcast.")
        start_lat, start_lon = 19.495814, 71.058396
    else:
        with open(DAY4_GEOJSON_PATH) as f:
            geojson = json.load(f)
        start_lon, start_lat = geojson["features"][0]["properties"]["centroid"]

    current_point = (start_lat, start_lon)
    uncertainty_radius_m = 100.0

    # Physics Calculation for Hindcast Vector
    wind_to_dir = (WIND_DIR_FROM + 180) % 360
    wind_u = (WIND_SPEED_KNOTS * KNOTS_TO_METERS_PER_HOUR * WIND_COEFF) * math.sin(math.radians(wind_to_dir))
    wind_v = (WIND_SPEED_KNOTS * KNOTS_TO_METERS_PER_HOUR * WIND_COEFF) * math.cos(math.radians(wind_to_dir))
    
    curr_u = (CURRENT_SPEED_KNOTS * KNOTS_TO_METERS_PER_HOUR * CURRENT_COEFF) * math.sin(math.radians(CURRENT_DIR_TO))
    curr_v = (CURRENT_SPEED_KNOTS * KNOTS_TO_METERS_PER_HOUR * CURRENT_COEFF) * math.cos(math.radians(CURRENT_DIR_TO))
    
    total_u = wind_u + curr_u
    total_v = wind_v + curr_v
    
    hindcast_u = -total_u
    hindcast_v = -total_v
    
    hindcast_distance = math.hypot(hindcast_u, hindcast_v)
    hindcast_bearing = (math.degrees(math.atan2(hindcast_u, hindcast_v)) + 360) % 360

    trajectory = [current_point]
    for _ in range(1, HINDCAST_HOURS + 1):
        next_point = geodesic(meters=hindcast_distance).destination(current_point, hindcast_bearing)
        current_point = (next_point.latitude, next_point.longitude)
        uncertainty_radius_m += (hindcast_distance * UNCERTAINTY_FACTOR)
        trajectory.append(current_point)

    origin_lat, origin_lon = trajectory[-1]

    # Export Corridor GeoJSON
    lon_lat_trajectory = [(lon, lat) for lat, lon in trajectory]
    corridor_line = LineString(lon_lat_trajectory)
    corridor_poly = corridor_line.buffer(0.035)

    corridor_geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "hindcast_hours": HINDCAST_HOURS,
                "origin_lat": round(origin_lat, 6),
                "origin_lon": round(origin_lon, 6),
                "final_uncertainty_radius_m": round(uncertainty_radius_m, 2)
            },
            "geometry": mapping(corridor_poly)
        }]
    }
    with open(os.path.join(DAY5_DIR, "origin_corridor.geojson"), "w") as f:
        json.dump(corridor_geojson, f, indent=4)

    # Export Particle Positions for Frontend
    particles_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"step_hours_back": i},
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}
            }
            for i, (lat, lon) in enumerate(trajectory)
        ]
    }
    with open(os.path.join(DAY5_DIR, "particles_trajectory.geojson"), "w") as f:
        json.dump(particles_geojson, f, indent=4)

    # Export Drift Metadata for Pratyush
    drift_metadata = {
        "hindcast_duration_hours": HINDCAST_HOURS,
        "time_step_hours": TIME_STEP_HOURS,
        "mode": "analyst-parameter-driven",
        "wind_speed_knots": WIND_SPEED_KNOTS,
        "wind_dir_from_deg": WIND_DIR_FROM,
        "current_speed_knots": CURRENT_SPEED_KNOTS,
        "current_dir_to_deg": CURRENT_DIR_TO,
        "wind_drift_coeff": WIND_COEFF,
        "current_coeff": CURRENT_COEFF,
        "estimated_origin_centroid": [round(origin_lon, 6), round(origin_lat, 6)],
        "final_uncertainty_radius_m": round(uncertainty_radius_m, 2),
        "origin_time_window": "T-12h to T-0h"
    }
    with open(os.path.join(DAY5_DIR, "drift_metadata.json"), "w") as f:
        json.dump(drift_metadata, f, indent=4)

    print(f"Operational hindcast complete. Estimated origin: {origin_lat:.6f}, {origin_lon:.6f}")

# ==========================================
# 3. Module 2: Controlled Simulation Validation
# ==========================================
def run_controlled_simulation():
    print("\n--- Running Controlled Drift-Validation Simulation ---")
    
    known_lat, known_lon = 19.500000, 70.500000
    wind_spd_mps = 7.72
    wind_dir_from = 270.0
    curr_spd_mps = 0.62
    curr_dir_to = 90.0
    wind_coeff = 0.03
    curr_coeff = 1.0
    duration_hrs = 12
    time_step_sec = 3600

    wind_dir_to = (wind_dir_from + 180) % 360
    wind_u = wind_spd_mps * wind_coeff * math.sin(math.radians(wind_dir_to))
    wind_v = wind_spd_mps * wind_coeff * math.cos(math.radians(wind_dir_to))
    curr_u = curr_spd_mps * curr_coeff * math.sin(math.radians(curr_dir_to))
    curr_v = curr_spd_mps * curr_coeff * math.cos(math.radians(curr_dir_to))
    
    total_u = wind_u + curr_u
    total_v = wind_v + curr_v
    
    forward_dist_m_hr = math.hypot(total_u, total_v) * 3600
    forward_bearing = (math.degrees(math.atan2(total_u, total_v)) + 360) % 360

    # Forward Drift
    current_pt = (known_lat, known_lon)
    for _ in range(duration_hrs):
        current_pt = geodesic(meters=forward_dist_m_hr).destination(current_pt, forward_bearing)[:2]
    slick_lat, slick_lon = current_pt

    # Backward Hindcast
    backward_bearing = (forward_bearing + 180) % 360
    current_pt = (slick_lat, slick_lon)
    for _ in range(duration_hrs):
        current_pt = geodesic(meters=forward_dist_m_hr).destination(current_pt, backward_bearing)[:2]
    pred_lat, pred_lon = current_pt

    error_m = geodesic((known_lat, known_lon), (pred_lat, pred_lon)).meters

    payload = {
        "spill_id": "drift_validation_sim_001",
        "data_mode": "controlled_simulation",
        "synthetic_data": True,
        "synthetic_data_scope": "drift_engine_validation_only",
        "known_source_lat": known_lat,
        "known_source_lon": known_lon,
        "known_release_time_utc": "2026-09-01T12:00:00Z",
        "simulated_observed_slick_lat": round(slick_lat, 6),
        "simulated_observed_slick_lon": round(slick_lon, 6),
        "predicted_origin_lat": round(pred_lat, 6),
        "predicted_origin_lon": round(pred_lon, 6),
        "origin_error_m": round(error_m, 4),
        "wind_speed_mps": wind_spd_mps,
        "wind_direction_from_degrees": wind_dir_from,
        "current_speed_mps": curr_spd_mps,
        "current_direction_to_degrees": curr_dir_to,
        "wind_drift_coefficient": wind_coeff,
        "current_coefficient": curr_coeff,
        "time_step_seconds": time_step_sec,
        "duration_hours": duration_hrs,
        "random_seed": 42,
        "evaluation_status": "controlled_simulation_not_real_ground_truth"
    }

    path = os.path.join(DAY5_DIR, "controlled_sim.json")
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Controlled simulation validation error: {error_m:.4f} meters. Saved to {path}")

# ==========================================
# 4. Module 3: Monte Carlo Sensitivity Tests
# ==========================================
def run_monte_carlo_simulation_scenario(test_name, wind_mps, wind_dir, curr_mps, curr_dir, seed_val):
    OBS_LAT = 19.495814
    OBS_LON = 71.058396
    DURATION_HOURS = 12
    TIMESTEP_SECONDS = 3600
    PARTICLE_COUNT = 250
    DIFFUSIVITY_M2_S = 1.0

    start_time = time.time()
    np.random.seed(seed_val)
    diffusion_sigma = math.sqrt(2.0 * DIFFUSIVITY_M2_S * TIMESTEP_SECONDS)
    
    wind_to = (wind_dir + 180.0) % 360.0
    wind_u = wind_mps * 0.03 * math.sin(math.radians(wind_to))
    wind_v = wind_mps * 0.03 * math.cos(math.radians(wind_to))
    curr_u = curr_mps * 1.0 * math.sin(math.radians(curr_dir))
    curr_v = curr_mps * 1.0 * math.cos(math.radians(curr_dir))
    
    hindcast_u = -(wind_u + curr_u)
    hindcast_v = -(wind_v + curr_v)
    
    step_dist = math.hypot(hindcast_u, hindcast_v) * TIMESTEP_SECONDS
    step_bearing = (math.degrees(math.atan2(hindcast_u, hindcast_v)) + 360.0) % 360.0
    
    initial_offsets = np.random.normal(0, 25.0, (PARTICLE_COUNT, 2))
    particles = []
    for i in range(PARTICLE_COUNT):
        p_pt = (OBS_LAT, OBS_LON)
        dx, dy = initial_offsets[i]
        init_dist = math.hypot(dx, dy)
        if init_dist > 0:
            init_bearing = (math.degrees(math.atan2(dx, dy)) + 360.0) % 360.0
            p_pt = geodesic(meters=init_dist).destination(p_pt, init_bearing)[:2]
        particles.append(p_pt)
        
    for _ in range(DURATION_HOURS):
        for i in range(PARTICLE_COUNT):
            current_lat, current_lon = particles[i]
            advected = geodesic(meters=step_dist).destination((current_lat, current_lon), step_bearing)[:2]
            diff_x = np.random.normal(0, diffusion_sigma)
            diff_y = np.random.normal(0, diffusion_sigma)
            diff_dist = math.hypot(diff_x, diff_y)
            diff_bearing = (math.degrees(math.atan2(diff_x, diff_y)) + 360.0) % 360.0
            particles[i] = geodesic(meters=diff_dist).destination(advected, diff_bearing)[:2]
            
    final_lats = [p[0] for p in particles]
    final_lons = [p[1] for p in particles]
    mean_lat = float(np.mean(final_lats))
    mean_lon = float(np.mean(final_lons))
    
    radii = [geodesic((mean_lat, mean_lon), (lat, lon)).meters for (lat, lon) in particles]
    effective_radius = float(np.max(radii)) + 150.0
    exec_time = time.time() - start_time
    
    return {
        "test_scenario": test_name,
        "parameters": {
            "wind_speed_mps": wind_mps,
            "wind_direction_from": wind_dir,
            "current_speed_mps": curr_mps,
            "current_direction_to": curr_dir,
            "random_seed": seed_val
        },
        "metrics": {
            "execution_time_seconds": round(exec_time, 4),
            "predicted_origin_lat": round(mean_lat, 6),
            "predicted_origin_lon": round(mean_lon, 6),
            "final_uncertainty_radius_m": round(effective_radius, 2)
        }
    }

def run_sensitivity_tests():
    print("\n--- Running Monte Carlo Engine Sensitivity Tests ---")
    base_wind = 7.7167
    base_curr = 0.6173
    
    results = [
        run_monte_carlo_simulation_scenario("Baseline Run", base_wind, 270.0, base_curr, 90.0, 42),
        run_monte_carlo_simulation_scenario("Reproducibility Check (Same Seed)", base_wind, 270.0, base_curr, 90.0, 42),
        run_monte_carlo_simulation_scenario("Sensitivity: High Wind (+20%)", base_wind * 1.2, 270.0, base_curr, 90.0, 42),
        run_monte_carlo_simulation_scenario("Sensitivity: High Current (+20%)", base_wind, 270.0, base_curr * 1.2, 90.0, 42),
        run_monte_carlo_simulation_scenario("Seed Variance (Seed 99)", base_wind, 270.0, base_curr, 90.0, 99)
    ]
    
    out_path = os.path.join(DAY5_DIR, "sensitivity_report.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=4)
    print(f"Sensitivity report saved to: {out_path}")

# ==========================================
# 5. Main Execution Entrypoint
# ==========================================
if __name__ == "__main__":
    print("Executing Full Day 5 Drift & Simulation Suite...")
    run_operational_hindcast()
    run_controlled_simulation()
    run_sensitivity_tests()
    print("\nAll Day 5 drift deliverables successfully generated and saved!")