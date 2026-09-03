"""Конфигурация флота: провайдеры, модели, цены, проекты.

Всё, что зависит от тарифа или ключей, живёт здесь — остальной код цен не знает.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

# Раскладка каталогов после разделения на backend/ и frontend/:
#   <корень>/backend/fleet/config.py — этот файл,
#   <корень>/backend/roles/*.md      — промпты агентов (часть кода, публичные),
#   <корень>/data/                   — память флота (отдельный приватный репозиторий).
# Поэтому data ищется от корня проекта, а roles — от каталога бэкенда.
BACKEND = Path(__file__).resolve().parent.parent
HOME = Path(os.environ.get("FLEET_HOME", BACKEND.parent))
DATA = Path(os.environ.get("FLEET_DATA", HOME / "data"))
ROLES_DIR = Path(os.environ.get("FLEET_ROLES", BACKEND / "roles"))
LOG_FILE = DATA / "logs" / "events.jsonl"
CONTEXT_DIR = DATA / "context"


@dataclass
class Provider:
    """Куда ходить за моделью и как представляться.

    Ключ ищется сначала в data/secrets.json (его задают в дашборде), потом в
    окружении по `key_env`. В team.json ключи не попадают никогда: этот файл
    лежит в репозитории с контекстом, пусть и приватном.
    """

    name: str
    title: str
    base_url: str
    # bearer — GLM, DeepSeek, OpenAI-совместимые; api-key — Yandex Cloud;
    # gigachat — Сбер, там сначала обмен ключа на access_token.
    auth: str = "bearer"
    key_env: str = ""
    # У GigaChat цепочка сертификатов подписана НУЦ Минцифры, которого нет в
    # системном хранилище: без этого флага запрос падает на проверке TLS.
    verify_ssl: bool = True
    headers: dict = field(default_factory=dict)
    # GLM и DeepSeek понимают поле thinking; чужим эндпоинтам оно ломает запрос.
    send_thinking: bool = True
    builtin: bool = False

    @property
    def api_key(self) -> str:
        from . import secrets

        key = secrets.get(self.name) or os.environ.get(self.key_env, "")
        if not key:
            where = f"в дашборде или в переменной {self.key_env}" if self.key_env else "в дашборде"
            raise RuntimeError(f"Не задан ключ провайдера {self.title} — укажи его {where}")
        return key


# GLM работает ТОЛЬКО через coding-эндпоинт: обычный /paas/v4 отвечает 1113 (нет баланса).
PROVIDERS: dict[str, Provider] = {
    "glm": Provider("glm", "z.ai (GLM)", "https://api.z.ai/api/coding/paas/v4",
                    key_env="GLM_API_KEY", builtin=True),
    "deepseek": Provider("deepseek", "DeepSeek", "https://api.deepseek.com",
                         key_env="DEEPSEEK_API_KEY", builtin=True),
}


def provider(name: str) -> Provider:
    if name not in PROVIDERS:
        raise KeyError(f"Нет провайдера {name!r}. Известны: {', '.join(PROVIDERS)}")
    return PROVIDERS[name]


@dataclass(frozen=True)
class Model:
    id: str
    # Имя провайдера, а не объект: модели заводятся из дашборда и хранятся в json.
    provider: str
    # Цена за 1M токенов в USD. Для GLM ноль: подписка Coding Plan, вызов бесплатен на марже.
    price_in: float = 0.0
    price_in_cached: float = 0.0
    price_out: float = 0.0
    vision: bool = False
    title: str = ""
    # Лимит одновременных запросов — из тарифа z.ai / здравого смысла для DeepSeek.
    concurrency: int = 3

    def cost(self, tokens_in: int, tokens_out: int, tokens_cached: int = 0) -> float:
        fresh = max(0, tokens_in - tokens_cached)
        return (
            fresh * self.price_in
            + tokens_cached * self.price_in_cached
            + tokens_out * self.price_out
        ) / 1_000_000


# Проверено живыми запросами: остальные имена GLM молча подменяются на эти три.
MODELS: dict[str, Model] = {
    "glm-5.3": Model("glm-5.3", "glm", concurrency=5),
    "glm-5.3-flash": Model("glm-5.3-flash", "glm", concurrency=50),
    "glm-4.6v": Model("glm-4.6v", "glm", vision=True, concurrency=10),
    "deepseek-v4-pro": Model(
        "deepseek-v4-pro", "deepseek", 0.435, 0.003625, 0.87, concurrency=8
    ),
    "deepseek-v4-flash": Model(
        "deepseek-v4-flash", "deepseek", 0.14, 0.0028, 0.28, concurrency=8
    ),
    "deepseek-v4-flash-vision-exp": Model(
        "deepseek-v4-flash-vision-exp", "deepseek", 0.14, 0.0028, 0.28, vision=True, concurrency=4
    ),
}


@dataclass
class Role:
    """Роль во флоте: какая модель, думает ли она и сколько ей можно."""

    name: str
    model: str
    thinking: bool = False
    max_tokens: int = 4000
    temperature: float = 0.3
    fallback: str | None = None
    description: str = ""
    prompt: str = field(default="", repr=False)


# Раскладка ролей. Думанье включено только там, где за него платят осмысленно:
# у senior и opponent оно и есть предмет покупки, у джунов оно жгло бы токены впустую.
ROLES: dict[str, Role] = {
    "consultant": Role(
        "consultant", "glm-5.3", thinking=True, max_tokens=6000,
        fallback="deepseek-v4-flash",
        description="Архитектор-консультант: альтернативы, критика решений, ревью подхода",
    ),
    "opponent": Role(
        "opponent", "deepseek-v4-flash", thinking=True, max_tokens=6000,
        fallback="glm-5.3",
        description="Оппонент в совете: другая семья моделей, спорит по существу",
    ),
    "senior": Role(
        "senior", "deepseek-v4-pro", thinking=True, max_tokens=12000,
        fallback="glm-5.3",
        description="Старший разработчик: сложная логика, рефакторинг, интеграции",
    ),
    "junior": Role(
        "junior", "glm-5.3-flash", thinking=False, max_tokens=6000,
        fallback="deepseek-v4-flash",
        description="Джун: простые компоненты, утилиты, рутинные правки",
    ),
    "vision": Role(
        "vision", "glm-4.6v", thinking=False, max_tokens=4000,
        fallback="deepseek-v4-flash-vision-exp",
        description="Зрячий аналитик: скриншоты, макеты, диаграммы → текст",
    ),
    "analyst": Role(
        "analyst", "glm-5.3-flash", thinking=False, max_tokens=6000,
        description="Аналитик данных: логи, метрики, JSON API, аномалии",
    ),
    "condenser": Role(
        "condenser", "glm-5.3-flash", thinking=False, max_tokens=2000, temperature=0.1,
        description="Сжимает страницы и выдачу поиска до выжимки фактов",
    ),
}

# Проекты флота. Одна команда, отдельный контекст на каждый проект.
PROJECTS: dict[str, str] = {
    "biqube": "BiQube — рабочий фронтенд: React 18, TS, Vite, antd 5, FSD, zustand",
    "shaks-site": "SHAKS.Site — личный проект",
    "shaks-daylik": "SHAKS.Daylik — личный проект",
    "shaks-llmframework": "SHAKS.LLMFramework — личный проект, фреймворк для LLM",
    "agent-dashboard": "AGENT.Dashboard — сам флот: MCP-сервер, дашборд, роли (этот репозиторий)",
}
