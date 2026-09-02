from pydantic import BaseModel


class LoadValue(BaseModel):
    grams: int
    display: str
