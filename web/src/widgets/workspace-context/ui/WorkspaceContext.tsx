'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { fleetApi, type ContextOut, type ProjectOut } from '@/shared/api'
import { cn } from '@/shared/lib/cn'
import { Field, TextArea, TextInput } from '@/shared/ui/Field'
import { GlassCard } from '@/shared/ui/GlassCard'

interface WorkspaceContextProps {
	projects: ProjectOut[]
	project: string
	onProjectChange: (id: string) => void
}

const ALWAYS = ['_core.md', '_rules.md']

/**
 * Материалы пространства: сюда грузят файлы и куски кода, здесь же лежат заметки.
 *
 * Само пространство, его описание и правила заводятся на вкладке «Пространства» —
 * это разные задачи: там настраивают проект, здесь наполняют его память.
 */
export function WorkspaceContext({ projects, project, onProjectChange }: WorkspaceContextProps) {
	const ids = { target: useId(), file: useId(), question: useId(), paste: useId(), name: useId(), note: useId() }
	const fileRef = useRef<HTMLInputElement>(null)

	const [context, setContext] = useState<ContextOut | null>(null)
	const [noteName, setNoteName] = useState('')
	const [noteText, setNoteText] = useState('')
	const [question, setQuestion] = useState('')
	const [paste, setPaste] = useState('')
	const [source, setSource] = useState('')
	const [status, setStatus] = useState('')
	const [busy, setBusy] = useState(false)

	const reload = useCallback(async () => {
		if (!project) return
		setContext(await fleetApi.context(project))
	}, [project])

	useEffect(() => {
		if (!project) return
		let alive = true
		fleetApi
			.context(project)
			.then((data) => alive && setContext(data))
			.catch((e: unknown) => alive && setStatus(e instanceof Error ? e.message : String(e)))
		return () => {
			alive = false
		}
	}, [project])

	const upload = async () => {
		const file = fileRef.current?.files?.[0]
		if (!file || !project) {
			setStatus('выбери файл и пространство')
			return
		}
		setBusy(true)
		setStatus('разбираю…')
		try {
			const result = await fleetApi.upload(project, file, question)
			// Черновик кладём в редактор, а не в контекст: сохраняет его человек, прочитав.
			setNoteName(result.name)
			setNoteText(result.note)
			setStatus(`${result.kind} · ${result.model} — проверь текст и сохрани`)
		} catch (e) {
			setStatus(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const digest = async () => {
		if (!project || paste.trim() === '') {
			setStatus('вставь текст')
			return
		}
		setBusy(true)
		setStatus('разбираю…')
		try {
			const result = await fleetApi.intakeText(project, paste, question, source)
			setNoteName(result.name)
			setNoteText(result.note)
			setStatus(`${result.model} — проверь текст и сохрани`)
		} catch (e) {
			setStatus(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const saveNote = async () => {
		if (!project || noteName.trim() === '') return
		setBusy(true)
		try {
			await fleetApi.saveNote(project, noteName, noteText)
			await reload()
			setStatus('сохранено')
			setTimeout(() => setStatus(''), 2000)
		} catch (e) {
			setStatus(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const notes = Object.keys(context?.notes ?? {})

	return (
		<div className="flex flex-col gap-3">
			<GlassCard title="Куда грузим" subtitle="материал попадёт в память выбранного пространства">
				<Field label="Пространство" id={ids.target} className="mt-3 max-w-md">
					<select
						id={ids.target}
						value={project}
						onChange={(e) => onProjectChange(e.target.value)}
						className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
					>
						<option value="" className="bg-slate-900">
							— выбери пространство —
						</option>
						{projects.map((p) => (
							<option key={p.id} value={p.id} className="bg-slate-900">
								{p.title.split(' — ')[0]}
							</option>
						))}
					</select>
				</Field>
			</GlassCard>

			<div className="grid gap-3 xl:grid-cols-2">
				<GlassCard title="Файл" subtitle="скриншот, макет, схема, лог, csv, json">
					<div className="mt-3 flex flex-wrap items-end gap-3">
						<Field label="Материал" id={ids.file} className="min-w-56 grow">
							<input
								ref={fileRef}
								id={ids.file}
								type="file"
								className="w-full cursor-pointer rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-slate-100"
							/>
						</Field>
						<button
							type="button"
							onClick={upload}
							disabled={busy || !project}
							className="mb-2 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
						>
							Разобрать в заметку
						</button>
					</div>
					<p className="text-xs text-slate-400">
						Картинку смотрит зрячий агент, текст сжимает condenser — обе роли бесплатные. Оригинал остаётся
						на диске, в контекст уедет только выжимка.
					</p>
				</GlassCard>

				<GlassCard title="Кусок текста" subtitle="код, лог, переписка, кусок документации">
					<Field label="Откуда это" id={ids.name} className="mt-3">
						<TextInput
							id={ids.name}
							value={source}
							placeholder="ответ API создания СДИЗ"
							onChange={(e) => setSource(e.target.value)}
						/>
					</Field>
					<Field label="Текст" id={ids.paste} className="mt-2">
						<TextArea
							id={ids.paste}
							rows={6}
							value={paste}
							onChange={(e) => setPaste(e.target.value)}
							className="font-mono"
						/>
					</Field>
					<button
						type="button"
						onClick={digest}
						disabled={busy || !project}
						className="mt-2 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
					>
						Разобрать в заметку
					</button>
				</GlassCard>
			</div>

			<GlassCard>
				<Field
					label="Что вытащить из материала"
					id={ids.question}
					hint="Необязательно. Например: «интересует только схема ответа и коды ошибок»"
				>
					<TextInput id={ids.question} value={question} onChange={(e) => setQuestion(e.target.value)} />
				</Field>
				{status && <p className="mt-2 text-sm text-slate-300">{status}</p>}
			</GlassCard>

			<div className="grid items-start gap-3 lg:grid-cols-[250px_1fr]">
				<div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-xl">
					{notes.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => {
								setNoteName(name)
								setNoteText(context?.notes[name] ?? '')
							}}
							className={cn(
								'block w-full cursor-pointer border-b border-white/5 px-4 py-2.5 text-left transition last:border-0 hover:bg-white/5',
								noteName === name && 'bg-white/10 shadow-[inset_3px_0_0] shadow-emerald-500'
							)}
						>
							<span className="text-sm text-slate-100">{name}</span>
							<span className="block font-mono text-xs text-slate-400">
								{(context?.notes[name] ?? '').length} символов
								{ALWAYS.includes(name) ? ' · всегда в промпте' : ''}
							</span>
						</button>
					))}
					{notes.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">Заметок пока нет.</p>}
				</div>

				<GlassCard>
					<div className="flex flex-wrap items-end gap-3">
						<Field label="Имя заметки" id={ids.note} className="min-w-56 grow">
							<TextInput id={ids.note} value={noteName} onChange={(e) => setNoteName(e.target.value)} />
						</Field>
						<button
							type="button"
							onClick={saveNote}
							disabled={busy || !project || noteName.trim() === ''}
							className="mb-2 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
						>
							Сохранить
						</button>
					</div>
					<TextArea
						rows={16}
						value={noteText}
						onChange={(e) => setNoteText(e.target.value)}
						placeholder="Решение, находка, кусок документации — то, что пригодится агентам позже."
						className="mt-3 font-mono"
					/>
				</GlassCard>
			</div>
		</div>
	)
}
