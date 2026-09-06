from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services import export_service

router = APIRouter(tags=["export"])


@router.get("/export", response_model=None)
def get_export(
    format: Literal["json", "csv"] = Query(default="json"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse | PlainTextResponse:
    payload = export_service.build_export(db, current_user)
    if format == "csv":
        body = export_service.to_csv(payload)
        return PlainTextResponse(
            content=body,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="liftlog-export.csv"'},
        )
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="liftlog-export.json"'},
    )
