from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime, timezone
from uuid import uuid4

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

app.include_router(system.router, prefix=settings.api_prefix)
app.include_router(scenes.router, prefix=settings.api_prefix)
app.include_router(detections.router, prefix=settings.api_prefix)
app.include_router(spills.router, prefix=settings.api_prefix)
app.include_router(drift_router)
app.include_router(detections.router, prefix='/api/v1')
app.include_router(candidates_router)
app.include_router(reports_router)