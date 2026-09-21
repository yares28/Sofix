import logging
from collections.abc import Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.admin import Process, launch_refresh
from app.admin import router as admin_router
from app.api import router
from app.config import Settings, settings
from app.schemas import ApiResponse

logger = logging.getLogger("sofix.api")


def error_response(status_code: int, message: str) -> JSONResponse:
    body = ApiResponse[None](success=False, error=message).model_dump(mode="json")
    return JSONResponse(status_code=status_code, content=body)


def create_app(config: Settings = settings, launcher: Callable[[int], Process | None] = launch_refresh) -> FastAPI:
    docs_enabled = config.app_env == "dev"
    application = FastAPI(
        title="Sofix API",
        version="0.1.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    application.state.settings = config
    application.state.launch_refresh = launcher
    application.state.refresh_processes = {}  # run id -> process started by this API instance
    application.add_middleware(GZipMiddleware, minimum_size=1024)  # the fixture grid is a few hundred KB of JSON
    # The Next.js app calls the API from its server, without cookies.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @application.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return error_response(exc.status_code, message)

    @application.exception_handler(OperationalError)
    @application.exception_handler(DBAPIError)
    async def database_unavailable(request: Request, exc: Exception) -> JSONResponse:
        # e.g. Neon suspended after hitting a free-tier limit, or the network is down
        logger.error("database error on %s: %s", request.url.path, type(exc).__name__)
        return error_response(503, "Fixture data is temporarily unavailable.")

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s", request.url.path)
        return error_response(500, "Something went wrong.")

    application.include_router(router)
    application.include_router(admin_router)
    return application


app = create_app()
