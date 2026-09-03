"""Сбор правил проекта из его репозитория.

Соглашения команды обычно уже описаны в самом репозитории (CLAUDE.md,
.claude/rules/*.md, AGENTS.md, .cursorrules). Пересказывать их руками в контекст
флота — гарантированный способ развести две версии правды, поэтому правила
забираются прямо из рабочего дерева.

Целиком они великоваты для промпта каждого агента, поэтому по умолчанию их
сжимает condenser: он бесплатный, а в постоянный блок промпта нужна выжимка
правил, а не их полный текст.
"""

from pathlib import Path

# Что считаем правилами. Порядок важен: он же порядок в собранном тексте.
# Ищем и в корне, и на уровень глубже: у разделённых репозиториев (backend/, frontend/)
# общие правила лежат в корне, а частные — в папке своей части.
PATTERNS = (
    "CLAUDE.md",
    "AGENTS.md",
    ".cursorrules",
    ".claude/rules/*.md",
    ".github/copilot-instructions.md",
    "CONTRIBUTING.md",
    "*/CLAUDE.md",
    "*/AGENTS.md",
    "*/.claude/rules/*.md",
)
LIMIT = 120_000


def collect(repo: str) -> list[tuple[str, str]]:
    """Находит файлы правил в рабочем дереве. Возвращает пары (путь, текст)."""
    root = Path(repo).expanduser()
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"Нет каталога {root}")

    found: list[tuple[str, str]] = []
    seen: set[Path] = set()
    for pattern in PATTERNS:
        for path in sorted(root.glob(pattern)):
            if not path.is_file() or path in seen:
                continue
            seen.add(path)
            found.append((str(path.relative_to(root)), path.read_text(encoding="utf-8", errors="ignore")))
    if not found:
        raise FileNotFoundError(
            f"В {root} не нашлось файлов правил. Искал: {', '.join(PATTERNS)}"
        )
    return found


def joined(repo: str) -> tuple[str, list[str]]:
    """Собранный текст правил и список файлов, из которых он получен."""
    found = collect(repo)
    text = "\n\n".join(f"# Из {name}\n\n{body}" for name, body in found)
    return text[:LIMIT], [name for name, _ in found]
