"""Схема команды: кто кому подчиняется и что происходит при отказе роли.

Человеку нужно видеть структуру команды и план подмены целиком, по одному
экрану, вместо чтения кода конфигурации. Модуль только формирует данные
(словари и тексты), ничего не печатает и не пишет на диск.

Схема строится по составу одного пространства: команды у проектов разные, и
общей схемы «на весь флот» не существует.
"""

from . import team
from .config import MODELS, Role

# Участники совета берутся из назначений: кого туда поставить, решает человек.
_COUNCIL_KEYS = ("propose", "oppose")


def _council_names(comp: team.Composition) -> tuple[str, ...]:
    """Имена ролей, назначенных предлагать и оспаривать."""
    names = []
    for key in _COUNCIL_KEYS:
        name = comp.role_for.get(key, "")
        if name in comp.roles and name not in names:
            names.append(name)
    return tuple(names)


def _role_view(role: Role) -> dict:
    """Собрать словарь роли для выдачи: добавить провайдера и план модели.

    Внешний агент может работать на модели, не заведённой в реестр, —
    это штатная ситуация, поэтому отдаём пустые строки, а не падаем.
    """
    model = MODELS.get(role.model)
    provider = model.provider if model else ""
    plan = model.plan if model else ""
    return {
        "name": role.name,
        "icon": role.icon,
        "model": role.model,
        "provider": provider,
        "description": role.description,
        "external": role.external,
        "fallback_model": role.fallback,
        "plan": plan,
    }


def _lead(comp: team.Composition) -> Role | None:
    """Главный (lead=True). В составе он обязан быть один, но код не падает."""
    for role in comp.roles.values():
        if role.lead:
            return role
    return None


def _deputy(comp: team.Composition) -> Role | None:
    """Заместитель (deputy=True). Может отсутствовать — схема это переживёт."""
    for role in comp.roles.values():
        if role.deputy:
            return role
    return None


def tree(project: str) -> dict:
    """Иерархия команды как словарь.

    Возвращает lead, deputy, совет (consultant/opponent) и остальных
    исполнителей. Каждая роль дополнена провайдером и планом модели.
    """
    comp = team.of(project)
    lead = _lead(comp)
    deputy = _deputy(comp)
    names = _council_names(comp)
    council = [_role_view(role) for name in names if (role := comp.roles.get(name)) is not None]
    excluded = set(names)
    if lead is not None:
        excluded.add(lead.name)
    if deputy is not None:
        excluded.add(deputy.name)
    workers = [
        _role_view(role) for role in comp.roles.values() if role.name not in excluded
    ]
    return {
        "lead": _role_view(lead) if lead else None,
        "deputy": _role_view(deputy) if deputy else None,
        "council": council,
        "workers": workers,
    }


def failover(project: str) -> list[dict]:
    """Что произойдёт при отказе каждой роли: цепочка подмен по шагам.

    Порядок важен: сначала дешёвая подмена резервной моделью, потом
    человекозамена через заместителя.
    """
    comp = team.of(project)
    lead = _lead(comp)
    deputy = _deputy(comp)
    result: list[dict] = []
    for role in comp.roles.values():
        steps: list[str] = []
        if role.fallback:
            steps.append(f"та же роль на резервной модели {role.fallback}")
        # Человекозамена нужна только там, где роль занимает уникальное
        # место в иерархии: внешний агент, главный и сам заместитель.
        if role.external or role.lead:
            if deputy is not None and deputy.name != role.name:
                steps.append(f"задачи уходят к заместителю {deputy.name}")
            else:
                steps.append("замены нет, работа встанет")
        if role.deputy:
            if lead is not None:
                steps.append("главный ведёт работу сам")
            else:
                steps.append("замены нет, работа встанет")
        result.append({"role": role.name, "icon": role.icon, "on_fail": steps})
    return result


def mermaid(project: str) -> str:
    """Схема команды как текст диаграммы mermaid (flowchart TD).

    Идентификаторы — латиница, подписи в кавычках: иначе mermaid ломается
    на кириллице и пробелах.
    """
    comp = team.of(project)
    lead = _lead(comp)
    deputy = _deputy(comp)

    def label(role: Role) -> str:
        # <br/> вместо переноса строки: mermaid внутри кавычек его понимает.
        return f"{role.name}<br/>{role.model}"

    lines = ["flowchart TD"]
    if lead is not None:
        lines.append(f'    {lead.name}["{label(lead)}"]')
    if deputy is not None:
        lines.append(f'    {deputy.name}["{label(deputy)}"]')

    names = _council_names(comp)
    council_roles = [r for r in (comp.roles.get(n) for n in names) if r is not None]
    excluded = set(names)
    if lead is not None:
        excluded.add(lead.name)
    if deputy is not None:
        excluded.add(deputy.name)
    workers = [r for r in comp.roles.values() if r.name not in excluded]

    for role in council_roles + workers:
        lines.append(f'    {role.name}["{label(role)}"]')

    if lead is not None and deputy is not None:
        lines.append(f"    {lead.name} --> {deputy.name}")
    if deputy is not None:
        for role in council_roles + workers:
            lines.append(f"    {deputy.name} --> {role.name}")
    proposer = comp.role_for.get("propose", "")
    opposer = comp.role_for.get("oppose", "")
    if proposer in comp.roles and opposer in comp.roles:
        lines.append(f"    {proposer} <--> {opposer}")

    return "\n".join(lines)


def markdown(project: str) -> str:
    """Выгрузка схемы одним markdown-документом.

    Документ не содержит даты: при одинаковом составе команды файл
    побайтово одинаковый, иначе каждая выгрузка выглядела бы изменением.
    """
    t = tree(project)
    lines: list[str] = []
    lines.append(f"# Схема команды: {team.project_of(project).title}")
    lines.append("")
    lines.append("```mermaid")
    lines.append(mermaid(project))
    lines.append("```")
    lines.append("")
    lines.append("| Роль | Модель | Провайдер | Кто это |")
    lines.append("| --- | --- | --- | --- |")

    def row(r: dict) -> str:
        return f"| {r['icon']} {r['name']} | {r['model']} | {r['provider']} | {r['description']} |"

    ordered: list[dict] = []
    for section in ("lead", "deputy"):
        if t[section] is not None:
            ordered.append(t[section])
    ordered.extend(t["council"])
    ordered.extend(t["workers"])
    for r in ordered:
        lines.append(row(r))

    lines.append("")
    lines.append("## Что если кто-то отвалится")
    lines.append("")
    for item in failover(project):
        steps = "; ".join(item["on_fail"]) if item["on_fail"] else "замены нет"
        lines.append(f"- **{item['icon']} {item['role']}**: {steps}")
    return "\n".join(lines) + "\n"
