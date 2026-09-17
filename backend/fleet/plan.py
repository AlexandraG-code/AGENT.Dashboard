# файл: backend/fleet/plan.py
"""Разбор плана работ, который агент-оркестратор возвращает текстом.


План приходит от языковой модели, поэтому доверять ему на слово нельзя:
модель может добавить пояснения вокруг JSON, придумать несуществующую роль
или забыть поле. Каждый элемент плана проверяется, невалидные отбрасываются.
"""

import json
import re

from . import prompts

# Больше восьми подзадач за раз не берём: человек не успеет проверить результат,
# а одна систематическая ошибка размножится по всем файлам.
LIMIT = 8

# Это не роль исполнителя, а действие оркестратора: созыв совета, где консультант
# предлагает, а оппонент атакует. Поэтому council не входит в список известных
# ролей и исполнителя не требует.
COUNCIL = "council"


def prompt(goal: str, roles: dict[str, str]) -> str:
    """Текст задачи для оркестратора: разбить цель на подзадачи.

    Формулировку держит человек (data/prompts.json), здесь только подстановки:
    цель, состав команды и правило про созыв совета.
    """
    listing = "\n".join(f"- {name}: {description}" for name, description in roles.items())
    council = (
        f'Если решение меняет устройство системы или есть несколько равных вариантов, '
        f'поставь первым элементом объект с "role": "{COUNCIL}" — это не исполнитель, '
        f'а созыв совета: тогда "task" — сам спорный вопрос, а "apply" всегда false. '
        f'Совет ставь не чаще одного раза на план.'
    )
    return prompts.render("plan_split", goal=goal, roles=listing,
                          limit=str(LIMIT), council=council)


def _extract_json_array(answer: str) -> list:
    """Массив JSON из ответа: блок ```json или первый массив в тексте."""
    # Блок кода — самый надёжный маркер границы JSON, поэтому ищем его первым.
    match = re.search(r"```json\s*(.*?)\s*```", answer, re.DOTALL)
    if match:
        data = json.loads(match.group(1))
        if isinstance(data, list):
            return data
        raise ValueError(f"В блоке json ожидался массив, получен {type(data).__name__}: {answer[:300]}")
    # Фолбэк: модель может забыть разметку — берём самую внешнюю пару скобок.
    start = answer.find("[")
    end = answer.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise ValueError(f"В ответе не найден массив JSON: {answer[:300]}")
    data = json.loads(answer[start:end + 1])
    if not isinstance(data, list):
        raise ValueError(f"Разобранный JSON — не массив ({type(data).__name__}): {answer[:300]}")
    return data


def parse(answer: str, known_roles: set[str]) -> list[dict]:
    """Разобрать ответ оркестратора в список подзадач.

    Невалидные элементы (не объект, нет полей, неизвестная роль) пропускаются:
    одна плохая строка не должна ломать весь план.
    """
    items: list[dict] = []
    council_used = False
    for raw in _extract_json_array(answer):
        if not isinstance(raw, dict):
            continue
        role = raw.get("role")
        task = raw.get("task")
        if not isinstance(role, str) or not role.strip():
            continue
        if not isinstance(task, str) or not task.strip():
            continue
        if role == COUNCIL:
            # Совет допустим один раз на план: два спора подряд — это не работа.
            if council_used:
                continue
            council_used = True
            items.append({"role": COUNCIL, "task": task, "apply": False})
            if len(items) >= LIMIT:
                break
            continue
        if role not in known_roles:
            continue
        # Строку "false" слепое bool() превратило бы в True, поэтому разбираем явно.
        flag = raw.get("apply")
        if isinstance(flag, bool):
            apply_value = flag
        elif isinstance(flag, str):
            apply_value = flag.strip().lower() == "true"
        else:
            apply_value = False
        items.append({"role": role, "task": task, "apply": apply_value})
        if len(items) >= LIMIT:
            break
    if not items:
        raise ValueError(
            f"В ответе нет ни одной валидной подзадачи (нужен объект с role и task, "
            f"role из известных): {answer[:300]}"
        )
    return items


def summary(items: list[dict]) -> str:
    """Короткая сводка плана для человека: строка на подзадачу и итог."""
    lines = []
    for item in items:
        # Первое предложение задачи даёт суть, не раздувая сводку.
        first = re.split(r"(?<=[.!?])\s", item["task"].strip(), maxsplit=1)[0]
        if item["role"] == COUNCIL:
            lines.append(f"совет: {first}")
            continue
        marker = " (пишет файлы)" if item["apply"] else ""
        lines.append(f"{item['role']}: {first}{marker}")
    lines.append(f"Итого подзадач: {len(items)}.")
    return "\n".join(lines)
