from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.analytics import DashboardOut, MuscleGroupVolumeOut, PlateauOut, VolumeByPeriodOut
from app.services import analytics_service
from app.services.analytics_service import Period

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardOut:
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


@router.get("/plateaus", response_model=list[PlateauOut])
def get_plateaus(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PlateauOut]:
    return analytics_service.get_plateaus(db, current_user)
