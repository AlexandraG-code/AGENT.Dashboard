// Написано агентом senior (deepseek-v4-pro) по ТЗ главного архитектора
'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi, type ModelOut, type RoleOut } from '@/shared/api'
import { roleTitle } from '@/shared/lib/roleTitle'
import { useAction } from '@/shared/lib/useAction'

/** Пустой черновик нового агента. */
const blank = (model: string): RoleOut => ({
	name: '',
	title: '',
	model,
	fallback: null,
	thinking: false,
	max_tokens: 6000,
	temperature: 0.3,
	description: '',
	prompt: '',
	lead: false,
	deputy: false,
	external: false,
	subagent: false,
	icon: '🤖',
	tools: [],
	team: ''
})

/** Тип состояния формы: выводится из хука, чтобы не держать список полей дважды. */
export type IAgentForm = ReturnType<typeof useAgentForm>

/**
 * Состояние редактора агентов: выбор из списка, черновик формы, сохранение и удаление.
 *
 * @param project — пространство: команда принадлежит ему, а не приложению
 * @param roles — состав команды с бэкенда
 * @param models — реестр моделей для выпадающих списков
 * @param onChanged — перечитать состояние приложения после изменения
 */
export function useAgentForm(
	project: string,
	roles: RoleOut[],
	models: Record<string, ModelOut>,
	onChanged: () => Promise<void> | void
) {
	const { t } = useTranslation()
	const firstModel = Object.keys(models)[0] ?? ''

	const [selected, setSelected] = useState<string | null>(roles[0]?.name ?? null)
	const [draft, setDraft] = useState<RoleOut>(roles[0] ?? blank(firstModel))
	// Карточка агента живёт в модалке: список отделов и агентов должен
	// оставаться на экране, а настройки открываться поверх него.
	const [open, setOpen] = useState<boolean>(false)

	const patch = <K extends keyof RoleOut>(field: K, value: RoleOut[K]) =>
		setDraft((prev) => ({ ...prev, [field]: value }))

	// Субагента запускает Claude Code, поэтому он всегда внешний, а модель у
	// него из списка Claude Code, а не из реестра: прежняя модель там не значится.
	const toggleSubagent = (value: boolean, claudeModels: string[]) =>
		setDraft((prev) => ({
			...prev,
			subagent: value,
			external: value || prev.external,
			model: value && !claudeModels.includes(prev.model) ? (claudeModels[0] ?? prev.model) : prev.model
		}))

	const select = (name: string) => {
		const role = roles.find((item) => item.name === name)
		if (!role) return
		setSelected(name)
		setDraft({ ...role, fallback: role.fallback ?? null })
	}

	const startNew = (team: string) => {
		setSelected(null)
		setDraft({ ...blank(firstModel), team })
	}

	const save = async () => {
		if (draft.name.trim() === '') throw new Error(t('agents.emptyName'))
		const saved = await fleetApi.saveRole({ ...draft, project, fallback: draft.fallback || null })
		await onChanged()
		setSelected(saved.name ?? draft.name)
		setOpen(false)
	}

	const remove = async () => {
		if (selected === null) return
		if (!window.confirm(t('agents.deleteConfirm', { name: roleTitle(draft) }))) return
		await fleetApi.deleteRole(project, selected)
		await onChanged()
		setSelected(null)
		setDraft(blank(firstModel))
		setOpen(false)
	}

	const saving = useAction(save, t('common.saved'))
	const removing = useAction(remove)

	return {
		draft,
		patch,
		toggleSubagent,
		selected,
		isNew: selected === null,
		open,
		edit: (name: string) => {
			select(name)
			setOpen(true)
		},
		create: (team: string) => {
			startNew(team)
			setOpen(true)
		},
		close: () => setOpen(false),
		select,
		startNew,
		save: saving.run,
		remove: removing.run,
		busy: saving.busy || removing.busy,
		status: saving.status,
		error: saving.error || removing.error
	}
}
