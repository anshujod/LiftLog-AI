from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.routers import analytics, auth, exercises, export, health, me, templates, workouts


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="LiftLog AI")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(exercises.router)
    app.include_router(workouts.router)
    app.include_router(templates.router)
    app.include_router(export.router)
    app.include_router(analytics.router)

    return app


app = create_app()
