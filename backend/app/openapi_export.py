"""Write the API's OpenAPI document for the frontend's generated types.

    python -m app.openapi_export             # writes ../frontend/lib/openapi.json
    python -m app.openapi_export --check     # exit 1 if the committed file is out of date (CI)

Built from the app object, so it needs no running server and no database. Then, in frontend/:
    npm run gen:types
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.config import REPO_ROOT, Settings
from app.main import create_app

TARGET = REPO_ROOT / "frontend" / "lib" / "openapi.json"


def openapi_document() -> str:
    schema = create_app(Settings(app_env="dev")).openapi()
    return json.dumps(schema, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the committed document is stale")
    parser.add_argument("--output", type=Path, default=TARGET)
    args = parser.parse_args(argv)

    document = openapi_document()
    if args.check:
        current = args.output.read_text(encoding="utf-8") if args.output.exists() else ""
        if current != document:
            print(
                f"{args.output} is out of date: run python -m app.openapi_export, then npm run gen:types",
                file=sys.stderr,
            )
            return 1
        return 0
    args.output.write_text(document, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
