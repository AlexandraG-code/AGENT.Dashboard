"""Роли команды: чтение состава пространства и поиск исполнителя по навыку.

Роль — настройка пользователя, а не часть приложения: и параметры, и системный
промпт лежат в составе пространства (`projects/<проект>/team.json`) и правятся
из дашборда. Код не знает ни одного имени роли: когда ему нужен исполнитель, он
спрашивает назначение («кто у нас сжимает текст»), а кого туда поставить —
решает человек.

Каждая функция здесь спрашивает пространство. Команда у проектов разная, и
«роль senior» без указания проекта — это два разных агента с разными промптами.
"""

import copy

from . import charter, team
from .config import ASSIGNMENTS, Role


def get(project: str, role: str) -> Role:
    """Роль по имени. Промпт уже внутри: он хранится вместе с настройками."""
    comp = team.of(project)
    if role not in comp.roles:
        raise KeyError(f"Нет роли {role!r} в пространстве {project!r}. "
                       f"Доступны: {', '.join(comp.roles) or 'ни одной'}")
    return copy.copy(comp.roles[role])


def system(role: Role, project: str) -> str:
    """Системный промпт агента: сначала регламенты, потом его собственный.

    Регламенты идут первыми не ради красоты: у агентов одного отдела этот блок
    побайтово одинаковый, и провайдер отдаёт его из префиксного кэша — у
    некоторых он дешевле промаха в десятки раз. Ролевой промпт после него
    короткий и у каждого свой.
    """
    rules = charter.brief(project, role.team)
    return f"{rules}\n\n---\n\n{role.prompt}" if rules else role.prompt


def assigned(project: str, key: str) -> Role | None:
    """Роль, назначенная на служебное действие в этом пространстве, или None.

    Назначение — выбор человека, а не свойство роли: одна настройка на команду.
    """
    comp = team.of(project)
    name = comp.role_for.get(key, "")
    return copy.copy(comp.roles[name]) if name in comp.roles else None


def need(project: str, key: str) -> Role:
    """То же, но с понятной ошибкой: без исполнителя действие невозможно."""
    role = assigned(project, key)
    if role is None:
        raise KeyError(
            f"В пространстве {project!r} не выбрано, кто {ASSIGNMENTS.get(key, key)}. "
            f"Назначьте агента в дашборде, вкладка «Агенты» → «Кто чем занят»."
        )
    return role


def can(project: str, role_name: str, tool: str) -> bool:
    """Разрешён ли роли инструмент. Права даёт приложение, а не промпт."""
    role = team.of(project).roles.get(role_name)
    return bool(role and tool in role.tools)


def stand_in(project: str, role_name: str) -> str:
    """Кто фактически выполнит задачу этой роли.

    Внешнюю роль наш клиент вызвать не может — у неё свой процесс и своя
    подписка, — поэтому её задача уходит заместителю. Если заместителя нет,
    пробуем внутреннего главного, а если и его нет, возвращаем исходное имя:
    пусть вызов упадёт выше с понятной ошибкой, а не молча уедет не туда.
    """
    comp = team.of(project)
    role = comp.roles.get(role_name)
    if role is None or not role.external:
        return role_name
    for candidate in comp.roles.values():
        if candidate.deputy:
            return candidate.name
    for candidate in comp.roles.values():
        if candidate.lead and not candidate.external:
            return candidate.name
    return role_name


def save_prompt(project: str, role: str, text: str) -> None:
    """Сохранить промпт роли — он живёт в составе команды, а не в файле."""
    team.set_role(project, role, prompt=text)


def all_roles(project: str) -> list[dict]:
    """Описание всех ролей пространства для дашборда."""
    return [
        {
            "name": name,
            "model": r.model,
            "fallback": r.fallback,
            "thinking": r.thinking,
            "max_tokens": r.max_tokens,
            "temperature": r.temperature,
            "description": r.description,
            "team": r.team,
            "lead": r.lead,
            "external": r.external,
            "deputy": r.deputy,
            "icon": r.icon,
            "tools": list(r.tools),
            "prompt": r.prompt,
        }
        for name, r in team.of(project).roles.items()
    ]
