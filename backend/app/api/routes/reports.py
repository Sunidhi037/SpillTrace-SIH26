from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import HTMLResponse

from app.reports.investigation_report import (
    InvestigationReport,
    build_investigation_report,
    render_investigation_report,
)

router = APIRouter(
    prefix="/api/v1/reports",
    tags=["reports"],
)

@router.post(
    "/investigation",
    response_model=InvestigationReport,
    summary="Create a compact investigation report payload",
)
def create_investigation_report(payload: dict) -> InvestigationReport:
    try:
        return build_investigation_report(payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INVALID_REPORT_PAYLOAD",
                "message": "The investigation report payload is invalid.",
                "errors": str(exc),
            },
        ) from exc


@router.post(
    "/investigation/html",
    response_class=HTMLResponse,
    summary="Render a stable HTML investigation report",
)
def create_investigation_html(payload: dict) -> Response:
    try:
        report = build_investigation_report(payload)
        html = render_investigation_report(report)

        return HTMLResponse(
            content=html,
            headers={
                "Content-Disposition": (
                    f'inline; filename="{report.report_id}.html"'
                ),
                "X-Report-ID": report.report_id,
                "X-Data-Mode": report.data_mode,
                "X-Investigation-Status": report.status,
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INVALID_REPORT_PAYLOAD",
                "message": "The investigation report payload is invalid.",
                "errors": str(exc),
            },
        ) from exc