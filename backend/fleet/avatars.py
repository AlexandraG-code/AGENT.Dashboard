# файл: backend/fleet/avatars.py
"""Аватары агентов.


Аватар нужен, чтобы в чате и списках агент узнавался мгновенно: значок глаз
ловит быстрее, чем читает имя роли. Файлы лежат в папке пространства
(`projects/<проект>/avatars`): роли принадлежат команде проекта, и senior
одного пространства — не senior другого.
"""

import re
from pathlib import Path

from . import layout

ALLOWED = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
# Аватар — кружок в сорок пикселей, мегабайты тут не нужны.
LIMIT = 2 * 1024 * 1024


def _clean_role(role: str) -> str:
    """Имя роли приходит снаружи, поэтому в путь идут только безопасные символы."""
    return re.sub(r"[^a-zA-Z0-9_-]", "", role)


def path_for(project: str, role: str) -> Path | None:
    """Файл аватара роли или None, если его нет."""
    name = _clean_role(role)
    if not name:
        return None
    directory = layout.avatars_dir(project)
    for ext in ALLOWED:
        candidate = directory / f"{name}{ext}"
        if candidate.exists():
            return candidate
    return None


def save(project: str, role: str, filename: str, data: bytes) -> Path:
    """Сохраняет аватар, заменяя прежний.

    Старые файлы с другими расширениями удаляются: иначе у роли окажется два
    аватара и непонятно, какой показывать.
    """
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED:
        raise ValueError(f"Такие картинки не принимаем: {suffix or 'без расширения'}. "
                         f"Можно: {', '.join(ALLOWED)}")
    if len(data) > LIMIT:
        raise ValueError(f"Картинка тяжелее двух мегабайт ({len(data)} байт) — уменьши её")

    name = _clean_role(role)
    if not name:
        raise ValueError("Пустое имя роли — аватар некуда класть")

    directory = layout.avatars_dir(project)
    for ext in ALLOWED:
        if ext != suffix:
            (directory / f"{name}{ext}").unlink(missing_ok=True)

    target = directory / f"{name}{suffix}"
    target.write_bytes(data)
    return target


def media_type(path: Path) -> str:
    """Тип содержимого по расширению файла."""
    suffix = path.suffix.lower()
    if suffix not in ALLOWED:
        raise ValueError(f"Недопустимое расширение аватара: {suffix}")
    return ALLOWED[suffix]


def remove(project: str, role: str) -> bool:
    """Удаляет аватар роли; True, если файл был."""
    path = path_for(project, role)
    if path is None:
        return False
    path.unlink()
    return True
