from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timezone
from uuid import uuid4

from app.api.routes.ais import router as ais_router
from app.api.routes.drift import router as drift_router
from app.core.config import settings
from app.api.routes import system, scenes, detections, spills
from app.api.routes.candidates import router as candidates_router
from app.api.routes.reports import router as reports_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id

    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": str(exc),
            "details": None,
            "run_id": request.headers.get("x-run-id"),
        },
    )


@app.get("/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "service": "spilltrace-backend",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready", tags=["system"])
def ready():
    return {
        "status": "ready",
        "service": "spilltrace-backend",
        "checks": {
            "application": "ok",
        },
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


# --- Route prefixes -------------------------------------------------------
# NOTE: this backend intentionally mounts spills under plain "/api" while
# everything else (system, scenes, detections, candidates, reports, drift,
# ais) lives under "/api/v1". That split is unusual but is what the current
# frontend (services/api.js) already calls -- do not "clean this up" into a
# single consistent prefix without updating the frontend to match, or every
# request will 404 again.
API_V1_PREFIX = "/api/v1"

app.include_router(system.router, prefix=API_V1_PREFIX)
app.include_router(scenes.router, prefix=API_V1_PREFIX)
app.include_router(detections.router, prefix=API_V1_PREFIX)
app.include_router(spills.router, prefix="/api")
app.include_router(drift_router)
app.include_router(candidates_router)
app.include_router(reports_router)
app.include_router(ais_router)


# --- Static artifact serving ------------------------------------------------
# ml/day1_inference.py writes oil_mask / probability_map / geojson files to
# a local "day1_output_results" folder (created relative to wherever uvicorn
# was launched from -- which, per the documented run instructions, is this
# backend/ directory, so the folder ends up at backend/day1_output_results).
# Without this mount, detector_service.normalize() can hand back a path like
# "/artifacts/<file>.geojson" (see detector_service.py) but nothing on the
# server actually serves that URL, so the frontend's fetch() for the slick
# GeoJSON silently fails. This mount makes that URL resolve to the real file.
_ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "day1_output_results"
_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/artifacts", StaticFiles(directory=str(_ARTIFACTS_DIR)), name="artifacts")
