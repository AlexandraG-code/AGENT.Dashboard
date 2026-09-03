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
    total: ClaudeSlot
    daily: dict[str, ClaudeSlot]
    models: dict[str, ClaudeSlot]
    projects: dict[str, ClaudeSlot]
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


class ModelOut(BaseModel):
    provider: str
    price_out: float
    concurrency: int
    vision: bool


class ProjectOut(BaseModel):
    id: str
    title: str


class StateOut(BaseModel):
    roles: list[RoleOut]
    projects: list[ProjectOut]
    models: dict[str, ModelOut]
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


class SavedOut(BaseModel):
    ok: bool = True
    id: str | None = None
    title: str | None = None
    name: str | None = None
    chars: int | None = None
    file: str | None = None
