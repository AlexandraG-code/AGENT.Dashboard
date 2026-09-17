'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi, type CatalogModel } from '@/shared/api'
import { useAction } from '@/shared/lib/useAction'

interface IModelCatalog {
	/** Модели, которые провайдер отдал в своём каталоге, с его же метаданными. */
	models: CatalogModel[]
	provider: string
	busy: boolean
	error: string
	load: (provider: string) => void
	clear: () => void
}

/**
 * Каталог моделей провайдера.
 *
 * Список принадлежит провайдеру, а не нам: имена вроде `GigaChat-2-Max` или
 * `gpt://<folder>/yandexgpt/latest` руками набираются с опечаткой, которая
 * вылезает только на первом вызове. Ключ для запроса берётся на бэкенде — он
 * привязан к провайдеру, а не к модели, и в браузер не возвращается.
 */
export function useModelCatalog(): IModelCatalog {
	const { t } = useTranslation()
	const [models, setModels] = useState<CatalogModel[]>([])
	const [provider, setProvider] = useState('')

	const fetchCatalog = async (name: string) => {
		if (name === '') return
		const result = await fleetApi.providerModels(name)
		setModels(result.models)
		setProvider(name)
	}

	const loading = useAction(fetchCatalog, t('models.catalogLoaded'))

	return {
		models,
		provider,
		busy: loading.busy,
		error: loading.error,
		load: (name) => void loading.run(name),
		clear: () => {
			setModels([])
			setProvider('')
		}
	}
}
