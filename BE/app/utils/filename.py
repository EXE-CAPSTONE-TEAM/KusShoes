import re
from pathlib import Path


def sanitize_filename(filename: str) -> str:
    name = Path(filename.replace("\\", "/")).name.strip()
    name = re.sub(r"[^\w\s.-]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = name.lstrip(". ")
    if not name or name in {".", ".."}:
        return "upload"
    return name[:255]
