from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routes import router


def create_app() -> FastAPI:
    app = FastAPI(title="Curia")
    init_db()

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    app.include_router(router)

    static = Path(__file__).resolve().parent.parent / "static"
    if static.is_dir():
        app.mount("/", StaticFiles(directory=static, html=True), name="static")
    return app


app = create_app()
