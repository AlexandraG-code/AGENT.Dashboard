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
 *
 * Пути — к клону репозитория и к папке данных — живут в локальном файле машины,
 * а не в данных: на другом устройстве они другие. По клону бэкенд узнаёт
 * пространство по рабочему каталогу, поэтому при выборе папки идентификатор и
 * название нового пространства берутся из её имени — переименовать можно потом,
 * опознаётся оно всё равно по пути.
 *
 * Папка данных пустая означает «в общем клоне данных», `data/projects/<id>`.
 * Заполненная уводит контекст проекта в выбранное место — например, к самому
 * проекту или на другой диск.
 */
export function useWorkspaceForm({ projects, project, onProjectChange, onChanged }: IOptions) {
	const { t } = useTranslation()

	const [selected, setSelected] = useState<string | null>(project || null)
	const [id, setId] = useState(project)
	const [title, setTitle] = useState(projects.find((item) => item.id === project)?.title ?? '')
	const [core, setCore] = useState('')
	const [rules, setRules] = useState('')
	const [repo, setRepo] = useState('')
	const [dataDir, setDataDir] = useState('')
	// Команда у каждого пространства своя, и у нового её нет вовсе: чтобы не
	// собирать десять ролей заново, состав можно взять у соседнего проекта.
	const [copyFrom, setCopyFrom] = useState('')
	const [globs, setGlobs] = useState('')
	const [signCode, setSignCode] = useState(true)
	const [found, setFound] = useState<string[]>([])
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
		const space = projects.find((item) => item.id === next)
		setSelected(next)
		setId(next)
		setTitle(space?.title ?? '')
		setRepo(space?.repo ?? '')
		setDataDir(space?.data_dir ?? '')
		setCopyFrom('')
		setGlobs((space?.rule_globs ?? []).join('\n'))
		setSignCode(space?.sign_code ?? true)
		setFound([])
		setNote('')
	}

	/** Папка выбрана в обзоре: у нового пространства из её имени берутся имя и алиас. */
	const pickRepo = (path: string) => {
		setRepo(path)
		const folder = path.replace(/\/+$/, '').split('/').pop() ?? ''
		if (selected !== null || folder === '') return
		if (id.trim() === '') setId(folder.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, ''))
		if (title.trim() === '') setTitle(folder)
	}

	const startNew = () => {
		setSelected(null)
		setId('')
		setTitle('')
		setCore('')
		setRules('')
		setRepo('')
		setDataDir('')
		setCopyFrom('')
		setGlobs('')
		setSignCode(true)
		setFound([])
		setNote('')
	}

	const save = async () => {
		const saved = await fleetApi.saveProject({
			id,
			title,
			repo,
			data_dir: dataDir,
			copy_from: copyFrom,
			sign_code: signCode,
			rule_globs: globs
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line !== '')
		})
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

	/** Показать, какие файлы правил нашлись по маскам, до вызова модели. */
	const probeRules = async () => {
		const result = await fleetApi.probeRules(selected ?? '', repo)
		setFound(result.files)
		setNote(t('spaces.probeSearched', { patterns: result.patterns.join(', ') }))
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
	const probing = useAction(probeRules)

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
		pickRepo,
		dataDir,
		setDataDir,
		copyFrom,
		setCopyFrom,
		globs,
		setGlobs,
		signCode,
		setSignCode,
		found,
		probe: probing.run,
		compress,
		setCompress,
		select,
		startNew,
		save: saving.run,
		remove: removing.run,
		importRules: importing.run,
		busy: saving.busy || removing.busy || importing.busy || probing.busy,
		status: saving.status || note,
		error: saving.error || removing.error || importing.error || probing.error
	}
}
