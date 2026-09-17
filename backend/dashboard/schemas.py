"""Схемы ответов API.

Нужны не ради валидации, а ради фронта: по ним FastAPI отдаёт честный
`/openapi.json`, из которого генерируются TypeScript-типы (`yarn generateApi`
в `web/`). Поэтому любое новое поле ответа заводится сначала здесь.
"""

from pydantic import BaseModel


class Slot(BaseModel):
    """Срез расхода: сколько вызовов, токенов и денег ушло в этом разрезе."""

    calls: int = 0
    cost: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cached: int = 0
    tokens_reasoning: int = 0
    seconds: float = 0.0
    errors: int = 0


class ProjectStat(Slot):
    by_model: dict[str, Slot] = {}
    by_role: dict[str, Slot] = {}


class ModelStat(Slot):
    by_project: dict[str, Slot] = {}
    by_role: dict[str, Slot] = {}


class RoleStat(Slot):
    by_model: dict[str, Slot] = {}


class DayStat(Slot):
    date: str


class ClaudeSlot(BaseModel):
    """Расход Claude Code. Без стоимости: работа идёт по подписке."""

    calls: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cached: int = 0
    tokens_reasoning: int = 0


class ClaudeStat(BaseModel):
    """Расход Claude Code.

    `windows` — скользящие окна («h5» — за последние 5 часов, «d7» — за неделю).
    Это объём работы, а не остаток лимита: сколько разрешено подпиской, Claude
    Code наружу не отдаёт, и выдумывать процент нельзя.
    """

    total: ClaudeSlot
    daily: dict[str, ClaudeSlot]
    models: dict[str, ClaudeSlot]
    projects: dict[str, ClaudeSlot]
    windows: dict[str, ClaudeSlot] = {}
    available: bool = False


class StatsOut(BaseModel):
    total: Slot
    total_24h: Slot
    projects: dict[str, ProjectStat]
    models: dict[str, ModelStat]
    roles: dict[str, RoleStat]
    daily: list[DayStat]
    claude: ClaudeStat


class Totals(BaseModel):
    """Сводка из журнала — то, что висит в шапке."""

    calls: int = 0
    cost: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    calls_24h: int = 0
    cost_24h: float = 0.0
    errors: int = 0
    by_model: dict[str, dict] = {}
    by_role: dict[str, dict] = {}
    by_project: dict[str, dict] = {}


class RoleOut(BaseModel):
    """Агент: настройки плюс текущий промпт."""

    name: str
    model: str
    fallback: str | None = None
    thinking: bool = False
    max_tokens: int = 4000
    temperature: float = 0.3
    description: str = ""
    prompt: str = ""
    lead: bool = False
    external: bool = False
    deputy: bool = False
    icon: str = ""
    tools: list[str] = []
    team: str = ""


class ModelOut(BaseModel):
    """Модель в реестре. `plan` — описание тарифа для человека, а не цена."""

    id: str = ""
    title: str = ""
    provider: str
    price_in: float = 0.0
    price_in_cached: float = 0.0
    price_out: float = 0.0
    concurrency: int = 3
    vision: bool = False
    plan: str = ""


class ProviderOut(BaseModel):
    """Провайдер моделей. Ключ наружу не отдаётся — только признак «задан»."""

    name: str
    title: str
    base_url: str
    auth: str
    key_env: str = ""
    verify_ssl: bool = True
    send_thinking: bool = True
    builtin: bool = False
    has_key: bool = False
    headers: dict[str, str] = {}


class ProjectOut(BaseModel):
    """Пространство: алиас и каталог клона, по которому оно опознаётся.

    `repo` и `data_dir` — пути этой машины, они приходят из локального файла
    и на другом устройстве будут другими (см. `fleet.paths`).
    """

    id: str
    title: str
    repo: str = ""
    data_dir: str = ""
    sign_code: bool = True
    rule_globs: list[str] = []


class StateOut(BaseModel):
    roles: list[RoleOut]
    projects: list[ProjectOut]
    models: dict[str, ModelOut]
    providers: list[ProviderOut]
    totals: Totals
    balance: float | None = None


class EventOut(BaseModel):
    """Строка журнала. Поля зависят от типа события, поэтому почти все необязательные."""

    ts: float
    event: str
    id: str | None = None
    role: str | None = None
    model: str | None = None
    project: str | None = None
    task: str | None = None
    name: str | None = None
    topic: str | None = None
    query: str | None = None
    kind: str | None = None
    error: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    tokens_cached: int | None = None
    tokens_reasoning: int | None = None
    cost: float | None = None
    seconds: float | None = None


class EventsOut(BaseModel):
    events: list[EventOut]
    totals: Totals


class MessageOut(BaseModel):
    """Сообщение промпта. content — строка либо части мультимодального сообщения."""

    role: str | None = None
    content: str | list[dict] | None = None


class CallOut(BaseModel):
    """Разговор целиком: что ушло в модель и что она ответила."""

    id: str
    ts: float
    role: str = ""
    model: str = ""
    requested: str = ""
    project: str = ""
    task: str = ""
    messages: list[MessageOut] = []
    text: str = ""
    reasoning: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cached: int = 0
    tokens_reasoning: int = 0
    cost: float = 0.0
    seconds: float = 0.0


class RunOut(BaseModel):
    text: str
    model: str
    cost: float
    seconds: float
    tokens_in: int
    tokens_out: int
    reasoning: int


class Turn(BaseModel):
    speaker: str
    model: str
    text: str


class CouncilOut(BaseModel):
    topic: str
    transcript: list[Turn]
    cost: float


class NoteInfo(BaseModel):
    name: str
    chars: int


class ContextOut(BaseModel):
    """Контекст проекта: список заметок и их содержимое."""

    project: str
    description: str
    files: list[NoteInfo]
    core_chars: int
    notes: dict[str, str]


class UploadOut(BaseModel):
    kind: str
    note: str
    model: str
    cost: float
    source: str
    name: str
    stored: str
    bytes: int


class CheckOut(BaseModel):
    """Результат проверки связи с провайдером."""

    ok: bool
    status: int = 0
    message: str = ""
    detail: str = ""
    seconds: float = 0.0
    model: str = ""


class SavedOut(BaseModel):
    ok: bool = True
    id: str | None = None
    title: str | None = None
    name: str | None = None
    chars: int | None = None
    file: str | None = None


class DirEntry(BaseModel):
    """Каталог в обзоре файловой системы."""

    name: str
    path: str
    is_repo: bool = False


class DirsOut(BaseModel):
    """Содержимое каталога: сам путь, куда подняться и что внутри."""

    path: str
    parent: str | None = None
    entries: list[DirEntry]


class CatalogModel(BaseModel):
    """Строка каталога провайдера. Поля — те, что прислал он сам."""

    id: str
    raw: str = ""
    owned_by: str = ""
    kind: str = ""
    registered: bool = False


class CatalogOut(BaseModel):
    """Каталог моделей провайдера: что он отдаёт и что из этого уже заведено."""

    provider: str
    models: list[CatalogModel]


# Написано агентом senior (deepseek-v4-pro) по ТЗ главного архитектора.
class JobStepOut(BaseModel):
    """Шаг выполнения задачи: кто сказал, какая модель, текст и время."""

    speaker: str
    model: str
    text: str
    at: float


class JobOut(BaseModel):
    """Карточка фоновой задачи: поля датакласса Job плюс шаги разговора."""

    id: str
    kind: str
    project: str
    role: str
    task: str
    status: str
    started: float
    finished: float | None = None
    cost: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    error: str = ""
    steps: list[JobStepOut] = []
    result: str = ""
    source: str = "dashboard"
    session: str = ""
    apply_files: bool = False


class JobsOut(BaseModel):
    """Список задач и число активных."""

    jobs: list[JobOut]
    active: int


class ChatMessageOut(BaseModel):
    """Сообщение общего чата: кто написал, что и кого позвал."""

    ts: float
    author: str
    text: str
    mentions: list[str] = []
    model: str = ""
    cost: float = 0.0


class ChatOut(BaseModel):
    """Лента чата, старые сообщения сверху."""

    messages: list[ChatMessageOut]


class RulesFoundOut(BaseModel):
    """Что нашлось по маскам правил: сам каталог, файлы и маски, по которым искали."""

    repo: str
    files: list[str]
    patterns: list[str]


class ChartRole(BaseModel):
    """Роль в схеме команды: кто это и на чём работает."""

    name: str
    icon: str = ""
    model: str = ""
    provider: str = ""
    description: str = ""
    external: bool = False
    fallback_model: str | None = None
    plan: str = ""


class ChartFailover(BaseModel):
    """Что произойдёт, если роль отвалится: шаги подмены по порядку."""

    role: str
    icon: str = ""
    on_fail: list[str] = []


class ChartOut(BaseModel):
    """Схема команды целиком: иерархия, подмены и текст диаграммы."""

    lead: ChartRole | None = None
    deputy: ChartRole | None = None
    council: list[ChartRole] = []
    workers: list[ChartRole] = []
    failover: list[ChartFailover] = []
    mermaid: str = ""


class ToolOut(BaseModel):
    """Инструмент: право, которое приложение выдаёт роли."""

    key: str
    title: str


class AssignmentOut(BaseModel):
    """Служебное место в команде и роль, которая его занимает."""

    key: str
    title: str
    role: str = ""


class SetupOut(BaseModel):
    """Устройство команды: что можно выдать роли, кто чем занят и какие есть отделы."""

    tools: list[ToolOut]
    assignments: list[AssignmentOut]
    teams: list["TeamOut"] = []


class PromptOut(BaseModel):
    """Служебный промпт: ключ, текст и допустимые подстановки."""

    key: str
    text: str = ""
    placeholders: list[str] = []


class PromptsOut(BaseModel):
    prompts: list[PromptOut]


class HintOut(BaseModel):
    """Подсказка к системному промпту: заголовок кнопки и текст для вставки."""

    key: str
    title: str = ""
    text: str


class HintsOut(BaseModel):
    hints: list[HintOut]


class TeamOut(BaseModel):
    """Отдел: группа агентов с общими регламентами."""

    name: str
    title: str = ""
    description: str = ""
    project: str = ""


class ScopeOut(BaseModel):
    """Область действия регламента: всё пространство или отдельный отдел."""

    key: str
    title: str


class DocOut(BaseModel):
    """Карточка регламента без текста: списку он не нужен, а весит страницы."""

    id: str
    title: str
    scope: str = "space"
    project: str = ""
    team: str = ""
    order: int = 0
    chars: int = 0


class DocTextOut(DocOut):
    text: str = ""


class OrgOut(BaseModel):
    """Организационная часть: отделы, регламенты и доступные области."""

    teams: list[TeamOut]
    documents: list[DocOut]
    scopes: list[ScopeOut]
