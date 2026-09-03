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
	api_key: ''
}

/**
 * Заготовки провайдеров: адреса и способ авторизации взяты из документации,
 * человеку остаётся вставить ключ.
 *
 * У GigaChat выключена проверка TLS: его цепочка подписана НУЦ Минцифры, которого
 * нет в системном хранилище. Поле thinking понимают только GLM и DeepSeek.
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
			auth: 'api-key'
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
		id: 'openai',
		labelKey: 'providers.presetOpenai',
		hintKey: 'providers.presetOpenaiHint',
		draft: { ...empty }
	}
]

export const emptyProvider = empty
