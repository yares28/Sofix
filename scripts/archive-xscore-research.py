"""Build the portable, read-only xScore handover from the research worktree."""

import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "backend/reports/experiments"
DEST = ROOT / "docs/xscore-evidence"
SECRET = re.compile(
    rb"ghp_[A-Za-z0-9]{25}|github_pat_[A-Za-z0-9_]{25}|postgres(?:ql)?://[^/\s]{4,}:[^\s@]{6,}@"
    rb"|sk-[a-zA-Z0-9_-]{24,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"
)


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def score_fields(value):
    if not isinstance(value, dict):
        return {}
    keys = {"n", "within7", "correct", "hits", "net", "rescued", "spoiled", "mae", "rmse", "bias",
            "selected", "advanced", "laterCandidateEvaluated", "laterEvaluated"}
    return {k: v for k, v in value.items() if k in keys and isinstance(v, (int, float, str, bool))}


def concise_metrics(doc):
    if not isinstance(doc, dict):
        return {}
    result = {}
    source = doc.get("cohorts")
    if not isinstance(source, dict):
        source = {k: doc[k] for k in ("start", "bench") if isinstance(doc.get(k), dict)}
    for name, data in source.items():
        if not isinstance(data, dict):
            continue
        row = score_fields(data)
        for key in ("later", "candidateLater", "control", "overall", "retained"):
            if fields := score_fields(data.get(key)):
                row[key] = fields
        for phase, metrics in (data.get("periods") or {}).items() if isinstance(data.get("periods"), dict) else ():
            if not isinstance(metrics, dict):
                continue
            against = {k: score_fields(v) for k, v in metrics.items()
                       if k.startswith(("against", "contextAgainst", "personalAgainst", "rawAgainst"))}
            if against:
                row.setdefault("periods", {})[phase] = against
        if row:
            result[name] = row
    return result


def build():
    DEST.mkdir(exist_ok=True)
    experiments = sorted(f for f in REPORTS.glob("*") if f.is_file())
    scripts = sorted((ROOT / "backend/app/research").glob("*.py"))
    tests = sorted((ROOT / "backend/tests").glob("test_score*.py"))
    frozen = ROOT / "backend/data/raw/score-foundation"
    vectors = [frozen / f for f in (
        "laliga_score_team_share_predictions_start.npz", "laliga_score_mixture_shrunk_predictions_bench.npz"
    )]
    if not experiments or not all(p.is_file() for p in vectors):
        raise ValueError("Run in the research worktree with both frozen forecast vectors available")
    index = []
    archive = DEST / "research-2026-11-12.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for file in sorted([*experiments, *scripts, *tests, *vectors]):
            name = file.relative_to(ROOT).as_posix()
            blob = file.read_bytes()
            if SECRET.search(blob):
                raise ValueError(f"Review potential credential in {name}")
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 12, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(info, blob)
            item = {"path": name, "sha256": digest(blob), "bytes": len(blob)}
            if file in experiments and file.suffix == ".json":
                try:
                    data = json.loads(blob.decode("utf-8-sig"))
                except (UnicodeError, json.JSONDecodeError):
                    data = None
                    item["invalidJson"] = True
                if isinstance(data, dict):
                    for key in ("scope", "purpose", "objective", "requestedOutcome", "hypothesis", "disposition",
                                "status", "evidenceLimit", "implementationKey", "sourceKey"):
                        if isinstance(data.get(key), str):
                            item[key] = data[key]
                    if metrics := concise_metrics(data):
                        item["scoreSummary"] = metrics
            index.append(item)
    (DEST / "index.json").write_text(json.dumps({
        "archive": archive.name,
        "sha256": digest(archive.read_bytes()),
        "contents": {"experimentArtifacts": len(experiments), "researchScripts": len(scripts),
                     "scoreTestFiles": len(tests), "frozenVectors": len(vectors)},
        "note": "Summaries are optional conveniences. Exact plans, metrics, failures and selection records are in the archive. "
                "An artifact is not necessarily an independent test or an accepted model.",
        "files": index,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with zipfile.ZipFile(archive) as output:
        if output.testzip() is not None:
            raise ValueError("Archive integrity check failed")


if __name__ == "__main__":
    build()
