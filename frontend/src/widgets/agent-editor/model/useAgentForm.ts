'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi, type ModelOut, type RoleOut } from '@/shared/api'
import { useAction } from '@/shared/lib/useAction'

/** Пустой черновик нового агента. */
const blank = (model: string): RoleOut => ({
	name: '',
	model,
	fallback: null,
	thinking: false,
	max_tokens: 6000,
	temperature: 0.3,
	description: '',
	prompt: ''
})

/**
 * Состояние редактора агентов: выбор из списка, черновик формы, сохранение и удаление.
 *
 * @param roles — состав команды с бэкенда
 * @param models — реестр моделей для выпадающих списков
 * @param onChanged — перечитать состояние приложения после изменения
 */
export function useAgentForm(roles: RoleOut[], models: Record<string, ModelOut>, onChanged: () => Promise<void> | void) {
	const { t } = useTranslation()
	const firstModel = Object.keys(models)[0] ?? ''

	const [selected, setSelected] = useState<string | null>(roles[0]?.name ?? null)
	const [draft, setDraft] = useState<RoleOut>(roles[0] ?? blank(firstModel))

	const patch = <K extends keyof RoleOut>(field: K, value: RoleOut[K]) =>
		setDraft((prev) => ({ ...prev, [field]: value }))

	const select = (name: string) => {
		const role = roles.find((item) => item.name === name)
		if (!role) return
		setSelected(name)
		setDraft({ ...role, fallback: role.fallback ?? null })
	}

	const startNew = () => {
		setSelected(null)
		setDraft(blank(firstModel))
	}

	const save = async () => {
		if (draft.name.trim() === '') throw new Error(t('agents.emptyName'))
		const saved = await fleetApi.saveRole({ ...draft, fallback: draft.fallback || null })
		await onChanged()
		setSelected(saved.name ?? draft.name)
	}

	const remove = async () => {
		if (selected === null) return
		if (!window.confirm(t('agents.deleteConfirm', { name: selected }))) return
		await fleetApi.deleteRole(selected)
		await onChanged()
		setSelected(null)
		setDraft(blank(firstModel))
	}

	const saving = useAction(save, t('common.saved'))
	const removing = useAction(remove)

	return {
		draft,
		patch,
		selected,
		isNew: selected === null,
		select,
		startNew,
		save: saving.run,
		remove: removing.run,
		busy: saving.busy || removing.busy,
		status: saving.status,
		error: saving.error || removing.error
	}
}
