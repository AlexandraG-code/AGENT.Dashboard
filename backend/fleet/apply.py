"""Раскладка ответа агента по файлам рабочего репозитория.

Запись вынесена сюда, чтобы не сжигать токены главного архитектора на
механическое применение кода. Защита от выхода за пределы корня обязательна:
пути приходят из текста, сгенерированного моделью, и доверять им нельзя.
"""

from pathlib import Path


def _is_fence(line: str) -> bool:
    """Проверяет, является ли строка началом или концом fenced-блока."""
    return line.strip().startswith("```")


def _extract_path(line: str) -> str | None:
    """Достаёт путь из строки-комментария с маркером ``файл:``.

    Поддерживаются комментарии Python/скриптов, JS-подобные и HTML-комментарии.
    Возвращает None, если строка не является признаком файла.
    """
    stripped = line.strip()

    if stripped.startswith("<!-- файл:"):
        if not stripped.endswith("-->"):
            return None
        path = stripped[len("<!-- файл:") : -3].strip()
        return path or None

    for marker in ("# файл:", "// файл:"):
        if stripped.startswith(marker):
            path = stripped[len(marker) :].strip()
            return path or None

    return None


def _prev_nonempty(lines: list[str], before: int) -> str | None:
    """Возвращает последнюю непустую строку перед индексом ``before``."""
    for index in range(before - 1, -1, -1):
        if lines[index].strip():
            return lines[index]
    return None


def blocks(answer: str) -> list[tuple[str, str]]:
    """Извлекает пары ``(путь, содержимое файла)`` из ответа модели.

    Блоки без метки пути пропускаются: это может быть пример вывода в консоль,
    который нельзя записывать в файл.
    """
    lines = answer.splitlines()
    result: list[tuple[str, str]] = []

    i = 0
    while i < len(lines):
        if not _is_fence(lines[i]):
            i += 1
            continue

        previous = _prev_nonempty(lines, i)
        pre_path = _extract_path(previous) if previous else None

        i += 1
        content_lines: list[str] = []
        closed = False

        while i < len(lines):
            if _is_fence(lines[i]):
                closed = True
                break
            content_lines.append(lines[i])
            i += 1

        if not closed:
            # Незакрытый блок не пишем: это оборванный ответ модели.
            break

        inside_path = None
        if content_lines:
            inside_path = _extract_path(content_lines[0])
            if inside_path:
                # Метка пути — служебная строка, в файл её не включаем.
                content_lines = content_lines[1:]

        path = pre_path or inside_path
        if path:
            result.append((path, "\n".join(content_lines)))

        i += 1  # шаг за закрывающий fence

    return result


def safe_path(root: Path, relative: str) -> Path:
    """Превращает относительный путь в абсолютный внутри ``root``.

    Отклоняет абсолютные пути, переходы через ``..`` и симлинки наружу.
    ``resolve`` обязателен: без него симлинк внутри корня мог бы тихо
    отдать запись за пределы репозитория.
    """
    root_resolved = root.resolve(strict=False)
    rel = relative.strip()

    if not rel:
        raise ValueError("Путь к файлу пуст.")

    rel_path = Path(rel)

    if rel_path.is_absolute():
        raise ValueError(f"Путь не должен быть абсолютным: {relative}")

    if ".." in rel_path.parts:
        raise ValueError(f"Путь содержит переход к родительскому каталогу: {relative}")

    candidate = root_resolved / rel_path
    resolved = candidate.resolve(strict=False)

    if not resolved.is_relative_to(root_resolved):
        raise ValueError(
            f"Путь {relative} выходит за пределы рабочего каталога {root_resolved}"
        )

    return resolved


def write(
    root: str,
    answer: str,
    allow: tuple[str, ...] = (
        ".py",
        ".ts",
        ".tsx",
        ".scss",
        ".css",
        ".md",
        ".json",
        ".sh",
        ".yml",
        ".yaml",
        ".txt",
    ),
) -> list[dict]:
    """Раскладывает ответ по файлам внутри ``root`` и возвращает отчёт.

    Ничего не удаляет: вернуть удалённое невозможно, а удалить лишнее
    человек успеет сам.
    """
    root_path = Path(root)
    written: list[dict] = []

    for relative, content in blocks(answer):
        rel = relative.strip()
        display_path = str(Path(rel)) if rel else rel

        try:
            target = safe_path(root_path, rel)
        except ValueError as exc:
            written.append(
                {
                    "path": display_path,
                    "action": "пропущен",
                    "lines_before": 0,
                    "lines_after": 0,
                    "reason": str(exc),
                }
            )
            continue

        suffix = target.suffix
        if suffix not in allow:
            written.append(
                {
                    "path": display_path,
                    "action": "пропущен",
                    "lines_before": 0,
                    "lines_after": 0,
                    "reason": f"расширение {suffix or 'пустое'} не разрешено",
                }
            )
            continue

        target.parent.mkdir(parents=True, exist_ok=True)

        if target.exists():
            before_text = target.read_text(encoding="utf-8")
            lines_before = len(before_text.splitlines())
            action = "обновлён"
        else:
            lines_before = 0
            action = "создан"

        # Ровно один перевод строки в конце: убираем все завершающие LF и добавляем один.
        normalized = content.rstrip("\n") + "\n"
        target.write_text(normalized, encoding="utf-8")

        normalized_without_final = normalized.rstrip("\n")
        lines_after = (
            len(normalized_without_final.splitlines()) if normalized_without_final else 0
        )

        written.append(
            {
                "path": display_path,
                "action": action,
                "lines_before": lines_before,
                "lines_after": lines_after,
                "reason": "",
            }
        )

    return written


def report(written: list[dict]) -> str:
    """Возвращает однострочную сводку по каждому файлу и общий итог."""
    lines: list[str] = []
    created = updated = skipped = 0

    for item in written:
        if item["action"] == "создан":
            created += 1
            lines.append(f"создан {item['path']} (+{item['lines_after']})")
        elif item["action"] == "обновлён":
            updated += 1
            lines.append(
                f"обновлён {item['path']} "
                f"({item['lines_before']} → {item['lines_after']})"
            )
        else:
            skipped += 1
            lines.append(f"пропущен {item['path']}: {item['reason']}")

    lines.append(f"Итог: создано {created}, обновлено {updated}, пропущено {skipped}.")
    return "\n".join(lines)
