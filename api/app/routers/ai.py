from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.service import AIService, get_ai_service
from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.ai import (
    AnalyzeProgressIn,
    AnalyzeProgressOut,
    ChatIn,
    ChatOut,
    WeekSummaryOut,
    WorkoutRecommendationIn,
    WorkoutRecommendationOut,
)
from app.services import chat_service, insight_service

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


@router.post("/ai/chat", response_model=ChatOut)
def chat(
    payload: ChatIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai: AIService = Depends(get_ai_service),
) -> ChatOut:
    return chat_service.ask(db, current_user, ai, payload)


@router.post("/ai/workout-recommendation", response_model=WorkoutRecommendationOut)
def workout_recommendation(
    payload: WorkoutRecommendationIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai: AIService = Depends(get_ai_service),
) -> WorkoutRecommendationOut:
    return insight_service.build_recommendation(db, current_user, ai, payload.exercise_id)


@router.get("/ai/weekly-summary", response_model=WeekSummaryOut)
def weekly_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai: AIService = Depends(get_ai_service),
) -> WeekSummaryOut:
    return insight_service.get_weekly_summary(db, current_user, ai)
