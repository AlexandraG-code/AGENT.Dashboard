'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi, type ContextOut } from '@/shared/api'
import { useAction } from '@/shared/lib/useAction'

/** Заметки, которые всегда уходят в промпт: их видно в списке отдельной пометкой. */
export const ALWAYS_IN_PROMPT = ['_core.md', '_rules.md']

/**
 * Наполнение памяти пространства: разбор файла или вставленного текста в черновик
 * заметки и сохранение готовой заметки.
 *
 * Черновик не сохраняется сам: материал сначала читает человек — этот текст
 * уедет в промпт агентов, и класть туда непрочитанное нельзя.
 *
 * @param project — выбранное пространство
 */
export function useContextNotes(project: string) {
	const { t } = useTranslation()
	const [file, setFile] = useState<File | null>(null)
	const [context, setContext] = useState<ContextOut | null>(null)
	const [name, setName] = useState('')
	const [text, setText] = useState('')
	const [question, setQuestion] = useState('')
	const [paste, setPaste] = useState('')
	const [source, setSource] = useState('')
	const [note, setNote] = useState('')

	useEffect(() => {
		if (!project) return
		let alive = true
		fleetApi
			.context(project)
			.then((data) => alive && setContext(data))
			.catch(() => undefined)
		return () => {
			alive = false
		}
	}, [project])

	const reload = async () => {
		if (project) setContext(await fleetApi.context(project))
	}

	const upload = async () => {
		if (!file || !project) throw new Error(t('context.needFile'))
		setNote(t('context.parsing'))
		const result = await fleetApi.upload(project, file, question)
		setName(result.name)
		setText(result.note)
		setNote(t('context.ready', { kind: result.kind, model: result.model }))
	}

	const digest = async () => {
		if (!project || paste.trim() === '') throw new Error(t('context.needText'))
		setNote(t('context.parsing'))
		const result = await fleetApi.intakeText(project, paste, question, source)
		setName(result.name)
		setText(result.note)
		setNote(t('context.ready', { kind: result.kind, model: result.model }))
	}

	const save = async () => {
		if (!project || name.trim() === '') return
		await fleetApi.saveNote(project, name, text)
		await reload()
		setNote('')
	}

	const uploading = useAction(upload)
	const digesting = useAction(digest)
	const saving = useAction(save, t('common.saved'))

	const openNote = (noteName: string) => {
		setName(noteName)
		setText(context?.notes[noteName] ?? '')
	}

	return {
		file,
		setFile,
		context,
		name,
		setName,
		text,
		setText,
		question,
		setQuestion,
		paste,
		setPaste,
		source,
		setSource,
		openNote,
		upload: uploading.run,
		digest: digesting.run,
		save: saving.run,
		busy: uploading.busy || digesting.busy || saving.busy,
		status: saving.status || note,
		error: uploading.error || digesting.error || saving.error
	}
}
