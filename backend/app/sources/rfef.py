from pypdf import PdfReader
from pathlib import Path

def extract_text(path: str|Path):
    reader=PdfReader(str(path))
    return "\n".join((p.extract_text() or "") for p in reader.pages)

def review_required(text: str):
    keys=("suspensión","suspendido","un partido","dos partidos","acumulación")
    lines=[ln.strip() for ln in text.splitlines() if any(k.lower() in ln.lower() for k in keys)]
    return lines
