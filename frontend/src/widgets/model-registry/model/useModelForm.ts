'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi, type ModelIn, type ModelOut } from '@/shared/api'
import { useAction } from '@/shared/lib/useAction'

import type { IModelPreset } from '../lib/presets'

const blank = (provider: string): ModelIn => ({
	id: '',
	provider,
	title: '',
	price_in: 0,
	price_in_cached: 0,
	price_out: 0,
	concurrency: 3,
	vision: false,
	plan: ''
})

/**
 * Состояние формы модели: черновик, сохранение, удаление и проверка живым вызовом.
 *
 * @param firstProvider — провайдер по умолчанию для новой модели
 * @param onChanged — перечитать состояние приложения после изменения
 */
export function useModelForm(firstProvider: string, onChanged: () => Promise<void> | void) {
	const { t } = useTranslation()
	const [draft, setDraft] = useState<ModelIn>(blank(firstProvider))
	const [selected, setSelected] = useState<string | null>(null)
	const [check, setCheck] = useState('')

	const patch = <K extends keyof ModelIn>(field: K, value: ModelIn[K]) =>
		setDraft((prev) => ({ ...prev, [field]: value }))

	const edit = (model: ModelOut) => {
		setSelected(model.id ?? '')
		setCheck('')
		setDraft({
			id: model.id ?? '',
			provider: model.provider,
			title: model.title ?? '',
			price_in: model.price_in ?? 0,
			price_in_cached: model.price_in_cached ?? 0,
			price_out: model.price_out ?? 0,
			concurrency: model.concurrency ?? 3,
			vision: model.vision ?? false,
			plan: model.plan ?? ''
		})
	}

	const startNew = () => {
		setSelected(null)
		setCheck('')
		setDraft(blank(firstProvider))
	}

	/** Модель из каталога провайдера: имя и провайдер оттуда, цены заполняет человек. */
	const useCatalogModel = (id: string, provider: string) => {
		setSelected(null)
		setCheck('')
		setDraft({ ...blank(provider), id, title: id })
	}

	/** Заготовка модели: подставляет идентификатор и цены, провайдера выбирает вызывающий. */
	const applyPreset = (preset: IModelPreset, provider: string) => {
		setSelected(null)
		setCheck('')
		setDraft({
			...blank(provider),
			id: preset.id,
			title: preset.title,
			price_in: preset.priceIn,
			price_in_cached: preset.priceInCached,
			price_out: preset.priceOut
		})
	}

	const save = async () => {
		await fleetApi.saveModel(draft)
		await onChanged()
		setSelected(draft.id)
	}

	const remove = async () => {
		if (selected === null) return
		if (!window.confirm(t('models.deleteConfirm', { name: selected }))) return
		await fleetApi.deleteModel(selected)
		await onChanged()
		startNew()
	}

	// Настоящий вызов модели с крошечным лимитом: только он ловит опечатку в её имени.
	const probe = async () => {
		if (draft.id.trim() === '' || draft.provider === '') return
		setCheck(t('providers.checking'))
		const result = await fleetApi.checkProvider(draft.provider, draft.id)
		setCheck(
			result.ok
				? t('providers.checkOk', { message: result.message, seconds: result.seconds })
				: t('providers.checkFail', { status: result.status || '—', message: result.message })
		)
	}

	const saving = useAction(save, t('common.saved'))
	const removing = useAction(remove)
	const checking = useAction(probe)

	return {
		draft,
		patch,
		selected,
		edit,
		startNew,
		applyPreset,
		useCatalogModel,
		check,
		save: saving.run,
		remove: removing.run,
		probe: checking.run,
		busy: saving.busy || removing.busy || checking.busy,
		status: saving.status,
		error: saving.error || removing.error || checking.error
	}
}
