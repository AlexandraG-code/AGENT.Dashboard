'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi, type ProjectOut } from '@/shared/api'
import { useAction } from '@/shared/lib/useAction'

export const CORE_NOTE = '_core.md'
export const RULES_NOTE = '_rules.md'

interface IOptions {
	projects: ProjectOut[]
	project: string
	onProjectChange: (id: string) => void
	onChanged: () => Promise<void> | void
}

/**
 * Состояние страницы пространств: выбор, поля, описание и правила, импорт правил
 * из репозитория проекта.
 *
 * Описание и правила — это две заметки контекста, а не отдельные поля в базе:
 * они целиком уходят в промпт каждого агента, и разводить «текст для человека»
 * и «текст для моделей» в разные места значит гарантированно их рассинхронизировать.
 */
export function useWorkspaceForm({ projects, project, onProjectChange, onChanged }: IOptions) {
	const { t } = useTranslation()

	const [selected, setSelected] = useState<string | null>(project || null)
	const [id, setId] = useState(project)
	const [title, setTitle] = useState(projects.find((item) => item.id === project)?.title ?? '')
	const [core, setCore] = useState('')
	const [rules, setRules] = useState('')
	const [repo, setRepo] = useState('')
	const [compress, setCompress] = useState(true)
	const [note, setNote] = useState('')

	useEffect(() => {
		if (selected === null) return
		let alive = true
		fleetApi
			.context(selected)
			.then((context) => {
				if (!alive) return
				setCore(context.notes[CORE_NOTE] ?? '')
				setRules(context.notes[RULES_NOTE] ?? '')
			})
			.catch(() => undefined)
		return () => {
			alive = false
		}
	}, [selected])

	const select = (next: string) => {
		setSelected(next)
		setId(next)
		setTitle(projects.find((item) => item.id === next)?.title ?? '')
		setNote('')
	}

	const startNew = () => {
		setSelected(null)
		setId('')
		setTitle('')
		setCore('')
		setRules('')
		setNote('')
	}

	const save = async () => {
		const saved = await fleetApi.saveProject({ id, title })
		const savedId = saved.id ?? id
		// Описание и правила сохраняем всегда: для нового пространства это и есть его смысл.
		await fleetApi.saveNote(savedId, CORE_NOTE, core)
		await fleetApi.saveNote(savedId, RULES_NOTE, rules)
		await onChanged()
		setSelected(savedId)
		onProjectChange(savedId)
	}

	const remove = async () => {
		if (selected === null) return
		if (!window.confirm(t('spaces.deleteConfirm', { name: selected }))) return
		await fleetApi.deleteProject(selected)
		await onChanged()
		startNew()
	}

	const importRules = async () => {
		if (selected === null) throw new Error(t('spaces.importNeedsSave'))
		setNote(t('spaces.importing'))
		const result = await fleetApi.importRules(selected, repo, compress)
		setRules(result.note)
		setNote(t('spaces.imported', { sources: result.source }))
	}

	const saving = useAction(save, t('common.saved'))
	const removing = useAction(remove)
	const importing = useAction(importRules)

	return {
		selected,
		id,
		setId,
		title,
		setTitle,
		core,
		setCore,
		rules,
		setRules,
		repo,
		setRepo,
		compress,
		setCompress,
		select,
		startNew,
		save: saving.run,
		remove: removing.run,
		importRules: importing.run,
		busy: saving.busy || removing.busy || importing.busy,
		status: saving.status || note,
		error: saving.error || removing.error || importing.error
	}
}
