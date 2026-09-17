import type { IProviderDraft } from '../model/useProviderForm'

export interface IPreset {
	id: string
	labelKey: string
	hintKey: string
	draft: IProviderDraft
}

const empty: IProviderDraft = {
	name: '',
	title: '',
	base_url: '',
	auth: 'bearer',
	key_env: '',
	verify_ssl: true,
	send_thinking: false,
	api_key: '',
	headers: ''
}

/**
 * Заготовки провайдеров: адреса и способ авторизации взяты из документации,
 * человеку остаётся вставить ключ.
 *
 * У GigaChat выключена проверка TLS: его цепочка подписана НУЦ Минцифры, которого
 * нет в системном хранилище. Поле thinking понимают только GLM и DeepSeek.
 * У Anthropic свой протокол (ключ в заголовке x-api-key, адрес /v1/messages),
 * поэтому у него отдельный способ авторизации, а не bearer.
 */
export const PROVIDER_PRESETS: IPreset[] = [
	{
		id: 'yandex',
		labelKey: 'providers.presetYandex',
		hintKey: 'providers.presetYandexHint',
		draft: {
			...empty,
			name: 'yandex',
			title: 'Yandex Cloud',
			base_url: 'https://llm.api.cloud.yandex.net/v1',
			auth: 'api-key',
			// Без каталога Yandex не отвечает: id подставляется и в заголовок, и в имя модели.
			headers: 'x-folder-id: '
		}
	},
	{
		id: 'gigachat',
		labelKey: 'providers.presetGigachat',
		hintKey: 'providers.presetGigachatHint',
		draft: {
			...empty,
			name: 'gigachat',
			title: 'GigaChat (Сбер)',
			base_url: 'https://gigachat.devices.sberbank.ru/api/v1',
			auth: 'gigachat',
			verify_ssl: false
		}
	},
	{
		id: 'anthropic',
		labelKey: 'providers.presetAnthropic',
		hintKey: 'providers.presetAnthropicHint',
		draft: {
			...empty,
			name: 'anthropic',
			title: 'Anthropic (Claude)',
			base_url: 'https://api.anthropic.com/v1',
			auth: 'anthropic',
			key_env: 'ANTHROPIC_API_KEY'
		}
	},
	{
		id: 'openai',
		labelKey: 'providers.presetOpenai',
		hintKey: 'providers.presetOpenaiHint',
		draft: { ...empty }
	}
]

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

export const emptyProvider = empty
