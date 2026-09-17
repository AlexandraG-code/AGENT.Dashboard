"""Сбор правил проекта из его репозитория.

Написано по ТЗ главного архитектора агентом senior (deepseek-v4-pro);
правки главного: комментарии-«почему» и порядок масок.

Соглашения команды обычно уже описаны в самом репозитории, но раскладка у всех
разная: CLAUDE.md, AGENTS.md, .claude/rules/, .agents/skills/, .codex/rules/,
.cursor/rules/. Поэтому маски поиска настраиваемые: пространство может задать
свой список, а без него берётся набор по умолчанию.

Целиком правила великоваты для промпта каждого агента, поэтому по умолчанию их
сжимает condenser: он бесплатный, а в постоянный блок промпта нужна выжимка
правил, а не их полный текст.
"""

from collections.abc import Sequence
from pathlib import Path

# Что считаем правилами по умолчанию. Порядок важен: он же порядок в собранном
# тексте. Ищем и в корне, и на уровень глубже: у разделённых репозиториев
# (backend/, frontend/) общие правила лежат в корне, а частные — в своей папке.
PATTERNS = (
    "CLAUDE.md",
    "AGENTS.md",
    ".cursorrules",
    ".claude/rules/*.md",
    ".claude/skills/*/SKILL.md",
    ".agents/skills/*/SKILL.md",
    ".codex/rules/*",
    ".cursor/rules/*.mdc",
    ".github/copilot-instructions.md",
    ".github/instructions/*.md",
    "docs/rules/*.md",
    "CONTRIBUTING.md",
    "*/CLAUDE.md",
    "*/AGENTS.md",
    "*/.claude/rules/*.md",
)

LIMIT = 120_000
# Правила такого размера не бывают: всё, что крупнее, — выгрузка или данные.
MAX_FILE_SIZE = 200_000


def _rule_files(root: Path, patterns: Sequence[str]) -> list[Path]:
    """Подходящие файлы без повторов.

    Отбор вынесен отдельно, чтобы `probe` показывал ровно тот же набор,
    который потом соберёт `collect`: иначе человек увидит одно, а в промпт
    уедет другое.
    """
    seen: set[Path] = set()
    found: list[Path] = []
    for pattern in patterns:
        for path in sorted(root.glob(pattern)):
            if not path.is_file() or path in seen:
                continue
            size = path.stat().st_size
            if size == 0 or size > MAX_FILE_SIZE:
                continue
            seen.add(path)
            found.append(path)
    return found


def _root(repo: str) -> Path:
    root = Path(repo).expanduser()
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"Нет каталога {root}")
    return root


def collect(repo: str, patterns: list[str] | None = None) -> list[tuple[str, str]]:
    """Находит файлы правил в рабочем дереве. Возвращает пары (путь, текст)."""
    root = _root(repo)
    masks = patterns or list(PATTERNS)
    found = [
        (str(path.relative_to(root)), path.read_text(encoding="utf-8", errors="ignore"))
        for path in _rule_files(root, masks)
    ]
    if not found:
        raise FileNotFoundError(
            f"В {root} не нашлось файлов правил. Искал: {', '.join(masks)}"
        )
    return found


def joined(repo: str, patterns: list[str] | None = None) -> tuple[str, list[str]]:
    """Собранный текст правил и список файлов, из которых он получен."""
    found = collect(repo, patterns)
    text = "\n\n".join(f"# Из {name}\n\n{body}" for name, body in found)
    return text[:LIMIT], [name for name, _ in found]


def probe(repo: str, patterns: list[str] | None = None) -> list[str]:
    """Только пути найденных файлов — показать человеку до вызова модели."""
    root = _root(repo)
    return [str(path.relative_to(root)) for path in _rule_files(root, patterns or list(PATTERNS))]
