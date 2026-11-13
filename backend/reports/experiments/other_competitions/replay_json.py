"""The Audit's replay file from evaluate.py's final run (variants old and plain_small), 2025/26 only.

python reports/experiments/other_competitions/replay_json.py results/final.json ../frontend/lib/data/sofix_v1_competitions_replay.json
"""

import json
import sys
from pathlib import Path

report = json.loads(Path(sys.argv[1]).read_text("utf-8"))
phase = next(p for p in report["phases"] if p["from"] == "2025-07-01")
out = {"period": "2025/26", "fittedOn": "2023/24-2024/25", "variant": "plain_small", "competitions": {}}
for code, entry in phase["competitions"].items():
    out["competitions"][code] = {"period": "2025/26"} | {
        role: {
            "cases": entry["plain_small"][role]["cases"],
            "previousHits": entry["old"][role]["hits"],
            "hits": entry["plain_small"][role]["hits"],
            "gained": entry["plain_small"][role]["gained"],
            "spoiled": entry["plain_small"][role]["spoiled"],
            "previousMAE": entry["old"][role]["mae"],
            "mae": entry["plain_small"][role]["mae"],
        }
        for role in ("start", "bench")
    }
Path(sys.argv[2]).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
