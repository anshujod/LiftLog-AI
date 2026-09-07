import uuid

from pydantic import BaseModel, ConfigDict

from app.ai.payloads import Insight, ProgressAnalysisPayload
from app.services.analytics_service import Period


class AnalyzeProgressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period: Period = "90d"
    exercise_id: uuid.UUID | None = None


class AnalyzeProgressOut(BaseModel):
    insight: Insight
    payload: ProgressAnalysisPayload
