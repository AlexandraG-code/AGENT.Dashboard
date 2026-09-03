"""Конфигурация флота: провайдеры, модели, цены, проекты.

Всё, что зависит от тарифа или ключей, живёт здесь — остальной код цен не знает.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

# Корень репозитория и каталог рантайм-данных (логи, контекст-банк).
# data/ вынесен в .gitignore: там контекст рабочих проектов и он не должен уезжать на GitHub.
HOME = Path(os.environ.get("FLEET_HOME", Path(__file__).resolve().parent.parent))
DATA = Path(os.environ.get("FLEET_DATA", HOME / "data"))
ROLES_DIR = Path(os.environ.get("FLEET_ROLES", HOME / "roles"))
LOG_FILE = DATA / "logs" / "events.jsonl"
CONTEXT_DIR = DATA / "context"


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    api_key_env: str

    @property
    def api_key(self) -> str:
        key = os.environ.get(self.api_key_env, "")
        if not key:
            raise RuntimeError(f"Не задан {self.api_key_env} — добавь его в ~/.zshrc")
        return key


# GLM работает ТОЛЬКО через coding-эндпоинт: обычный /paas/v4 отвечает 1113 (нет баланса).
GLM = Provider("glm", "https://api.z.ai/api/coding/paas/v4", "GLM_API_KEY")
DEEPSEEK = Provider("deepseek", "https://api.deepseek.com", "DEEPSEEK_API_KEY")


@dataclass(frozen=True)
class Model:
    id: str
    provider: Provider
    # Цена за 1M токенов в USD. Для GLM ноль: подписка Coding Plan, вызов бесплатен на марже.
    price_in: float = 0.0
    price_in_cached: float = 0.0
    price_out: float = 0.0
    vision: bool = False
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
    "glm-5.3": Model("glm-5.3", GLM, concurrency=5),
    "glm-5.3-flash": Model("glm-5.3-flash", GLM, concurrency=50),
    "glm-4.6v": Model("glm-4.6v", GLM, vision=True, concurrency=10),
    "deepseek-v4-pro": Model(
        "deepseek-v4-pro", DEEPSEEK, 0.435, 0.003625, 0.87, concurrency=8
    ),
    "deepseek-v4-flash": Model(
        "deepseek-v4-flash", DEEPSEEK, 0.14, 0.0028, 0.28, concurrency=8
    ),
    "deepseek-v4-flash-vision-exp": Model(
        "deepseek-v4-flash-vision-exp", DEEPSEEK, 0.14, 0.0028, 0.28, vision=True, concurrency=4
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
}
