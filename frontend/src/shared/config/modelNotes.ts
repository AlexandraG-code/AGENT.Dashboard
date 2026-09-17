/**
 * Короткие справки по семействам моделей: на что модель годится и какие у неё
 * лимиты. Нужны в каталоге провайдера — из голого списка `GigaChat-2-Pro`,
 * `aliceai-llm-flash`, `yandexgpt-5.1-pro` не видно, что выбирать.
 *
 * Это СПРАВОЧНИК, а не данные провайдера: провайдеры отдают только имена, а
 * контекст и назначение приходится брать из их документации. Поэтому у каждой
 * записи есть ссылка на источник, а модели без записи остаются без пояснения —
 * пустая клетка честнее придуманной.
 *
 * Проверено 2026-09-04.
 */
export interface IModelNote {
	/** Начало идентификатора модели, в нижнем регистре. Длинные совпадения важнее коротких. */
	prefix: string
	what: string
	limits: string
	source: string
}

export const MODEL_NOTES: IModelNote[] = [
	{
		prefix: 'gigachat-2-max',
		what: 'Старшая GigaChat: сложные рассуждения, длинные документы, вызов функций',
		limits: 'контекст 128k токенов; тариф по токенам',
		source: 'https://developers.sber.ru/docs/ru/gigachat/models/gigachat-2-max'
	},
	{
		prefix: 'gigachat-2-pro',
		what: 'Средняя GigaChat: рабочая лошадка для текста и функций',
		limits: 'контекст 128k токенов; тариф по токенам',
		source: 'https://developers.sber.ru/docs/ru/gigachat/models/gigachat-2-pro'
	},
	{
		prefix: 'gigachat-2',
		what: 'Младшая GigaChat: быстрые короткие задачи',
		limits: 'контекст 128k токенов; тариф по токенам',
		source: 'https://developers.sber.ru/docs/ru/gigachat/models/gigachat-2'
	},
	{
		prefix: 'gigachat',
		what: 'Первое поколение — запросы автоматически уходят на GigaChat-2',
		limits: 'заводить смысла нет: провайдер подменит модель',
		source: 'https://developers.sber.ru/docs/ru/gigachat/models/updates'
	},
	{
		prefix: 'yandexgpt-5.1',
		what: 'Старшая YandexGPT: русский текст, меньше выдумок (16% против 30% у 5-й)',
		limits: 'контекст 32k токенов; 0,40 ₽ за 1000 токенов',
		source: 'https://yandex.cloud/ru/docs/ai-studio/concepts/generation/models'
	},
	{
		prefix: 'yandexgpt-lite',
		what: 'Лёгкая YandexGPT (8B): простые русские тексты и классификация',
		limits: 'контекст 32k токенов; 0,20 ₽ за 1000 токенов',
		source: 'https://yandex.cloud/ru/docs/ai-studio/concepts/generation/models'
	},
	{
		prefix: 'text-embeddings',
		what: 'Эмбеддинги, а не чат: агенту такую модель ставить нельзя',
		limits: 'выдаёт векторы, не текст',
		source: 'https://yandex.cloud/ru/docs/ai-studio/concepts/embeddings'
	},
	{
		prefix: 'embeddings',
		what: 'Эмбеддинги, а не чат: агенту такую модель ставить нельзя',
		limits: 'выдаёт векторы, не текст',
		source: 'https://developers.sber.ru/docs/ru/gigachat/models'
	},
	{
		prefix: 'gigaembeddings',
		what: 'Эмбеддинги, а не чат: агенту такую модель ставить нельзя',
		limits: 'выдаёт векторы, не текст',
		source: 'https://developers.sber.ru/docs/ru/gigachat/models'
	},
	{
		prefix: 'claude-opus-5',
		what: 'Старшая Claude: сложный код и длинные агентские задачи',
		limits: 'контекст 1M токенов; $5 вход / $25 выход за 1M',
		source: 'https://docs.claude.com/en/docs/about-claude/models'
	},
	{
		prefix: 'claude-sonnet-5',
		what: 'Средняя Claude: код и текст дешевле старшей',
		limits: 'контекст 1M токенов; $2 вход / $10 выход за 1M',
		source: 'https://docs.claude.com/en/docs/about-claude/models'
	},
	{
		prefix: 'claude-haiku-4-5',
		what: 'Быстрая Claude: короткие задачи и разбор текста',
		limits: 'контекст 200k токенов; $1 вход / $5 выход за 1M',
		source: 'https://docs.claude.com/en/docs/about-claude/models'
	}
]

/** Справка по модели: самое длинное совпадение по началу идентификатора. */
export function noteFor(modelId: string): IModelNote | null {
	const id = modelId.toLowerCase()
	const found = MODEL_NOTES.filter((note) => id.startsWith(note.prefix)).sort(
		(a, b) => b.prefix.length - a.prefix.length
	)
	return found[0] ?? null
}
