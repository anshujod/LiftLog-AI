from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.service import AIService, get_ai_service
from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.ai import AnalyzeProgressIn, AnalyzeProgressOut
from app.services import insight_service

router = APIRouter(tags=["ai"])


@router.post("/ai/analyze-progress", response_model=AnalyzeProgressOut)
def analyze_progress(
    payload: AnalyzeProgressIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai: AIService = Depends(get_ai_service),
) -> AnalyzeProgressOut:
    return insight_service.analyze_progress(
        db, current_user, ai, payload.period, payload.exercise_id
    )
