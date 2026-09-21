"""One log format for every job and the API process."""

import logging

_MARKER = "_sofix_handler"


def configure_logging(level: int = logging.INFO) -> None:
    """Idempotent: safe to call from every entry point (refresh calls the other jobs)."""
    root = logging.getLogger()
    if any(getattr(handler, _MARKER, False) for handler in root.handlers):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%Y-%m-%d %H:%M:%S"))
    setattr(handler, _MARKER, True)
    root.addHandler(handler)
    root.setLevel(level)
    # Keep third-party chatter out of job logs.
    for noisy in ("httpx", "httpcore", "alembic.runtime.plugins"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
