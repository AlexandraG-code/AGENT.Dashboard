'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi, type ProviderOut } from '@/shared/api'
import { useAction } from '@/shared/lib/useAction'

import { emptyProvider } from '../lib/presets'

export interface IProviderDraft {
	name: string
	title: string
	base_url: string
	auth: string
	key_env: string
	verify_ssl: boolean
	send_thinking: boolean
	api_key: string
}

/**
 * Состояние формы провайдера: черновик, сохранение, удаление и проверка связи.
 *
 * @param onChanged — перечитать состояние приложения после изменения
 */
export function useProviderForm(onChanged: () => Promise<void> | void) {
	const { t } = useTranslation()
	const [draft, setDraft] = useState<IProviderDraft>(emptyProvider)
	const [selected, setSelected] = useState<string | null>(null)
	const [check, setCheck] = useState('')

	const patch = <K extends keyof IProviderDraft>(field: K, value: IProviderDraft[K]) =>
		setDraft((prev) => ({ ...prev, [field]: value }))

	const edit = (provider: ProviderOut) => {
		setSelected(provider.name)
		setCheck('')
		setDraft({
			name: provider.name,
			title: provider.title,
			base_url: provider.base_url,
			auth: provider.auth,
			key_env: provider.key_env ?? '',
			verify_ssl: provider.verify_ssl ?? true,
			send_thinking: provider.send_thinking ?? false,
			// Существующий ключ наружу не отдаётся: пустое поле означает «оставить прежний».
			api_key: ''
		})
	}

	const applyPreset = (preset: IProviderDraft) => {
		setSelected(null)
		setCheck('')
		setDraft(preset)
	}

	const save = async () => {
		await fleetApi.saveProvider({ ...draft, api_key: draft.api_key === '' ? null : draft.api_key })
		await onChanged()
		setSelected(draft.name)
	}

	const remove = async () => {
		if (selected === null) return
		if (!window.confirm(t('providers.deleteConfirm', { name: selected }))) return
		await fleetApi.deleteProvider(selected)
		await onChanged()
		setSelected(null)
		setDraft(emptyProvider)
	}

	// Проверка идёт по сохранённому провайдеру: ключ живёт на бэкенде и в браузер
	// не возвращается, поэтому проверить незаписанный черновик нечем.
	const probe = async () => {
		const name = selected ?? draft.name
		if (!name) return
		setCheck(t('providers.checking'))
		const result = await fleetApi.checkProvider(name)
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
		applyPreset,
		check,
		save: saving.run,
		remove: removing.run,
		probe: checking.run,
		busy: saving.busy || removing.busy || checking.busy,
		status: saving.status,
		error: saving.error || removing.error || checking.error
	}
}
