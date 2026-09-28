// Написано агентом senior (glm-5.3) по ТЗ главного архитектора; модельная часть из widgets/model-registry.

export interface IModelPreset {
	id: string
	title: string
	priceIn: number
	priceInCached: number
	priceOut: number
}

/**
 * Модели Claude с ценами из официального прайса Anthropic ($ за миллион токенов).
 *
 * Цена чтения из кэша здесь равна цене обычного входа: своей ставки на кэш у нас
 * не подтверждено, а занизить её значит показать в отчёте расход меньше
 * настоящего. Верхняя граница честнее выдуманной скидки — реальную ставку из
 * своего тарифа можно вписать в форме.
 */
export const CLAUDE_MODEL_PRESETS: IModelPreset[] = [
	{ id: 'claude-opus-5', title: 'Claude Opus 5', priceIn: 5, priceInCached: 5, priceOut: 25 },
	{ id: 'claude-sonnet-5', title: 'Claude Sonnet 5', priceIn: 2, priceInCached: 2, priceOut: 10 },
	{ id: 'claude-haiku-4-5', title: 'Claude Haiku 4.5', priceIn: 1, priceInCached: 1, priceOut: 5 }
]
