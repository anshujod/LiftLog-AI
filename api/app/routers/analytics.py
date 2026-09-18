from typing import Literal

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.analytics import (
    DashboardOut,
    MuscleGroupVolumeOut,
    MuscleRecoveryOut,
    PlateauOut,
    VolumeByPeriodOut,
)
from app.services import analytics_service
from app.services.analytics_service import Period

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardOut:
    # 30s server TTL (see dashboard_cache) + 15s client SWR: collapses the
    # home navigation burst without risking stale training data.
    response.headers["Cache-Control"] = "private, max-age=15, stale-while-revalidate=30"
    return analytics_service.get_dashboard(db, current_user)


@router.get("/muscle-groups", response_model=list[MuscleGroupVolumeOut])
def get_muscle_group_volume(
    period: Period = "30d",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MuscleGroupVolumeOut]:
    return analytics_service.get_muscle_group_volume(db, current_user, period)


@router.get("/volume", response_model=list[VolumeByPeriodOut])
def get_volume(
    period: Period = "30d",
    granularity: Literal["week", "month"] = "week",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[VolumeByPeriodOut]:
    return analytics_service.get_volume(db, current_user, period, granularity)


@router.get("/recovery", response_model=list[MuscleRecoveryOut])
def get_muscle_recovery(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MuscleRecoveryOut]:
    return analytics_service.get_muscle_recovery(db, current_user)


@router.get("/plateaus", response_model=list[PlateauOut])
def get_plateaus(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PlateauOut]:
    return analytics_service.get_plateaus(db, current_user)
