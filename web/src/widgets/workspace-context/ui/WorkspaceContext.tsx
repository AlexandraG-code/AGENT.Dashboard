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
	onChanged: () => Promise<void> | void
}

const CORE = '_core.md'

/**
 * Рабочее пространство: чем оно является, что флот о нём знает и что в него добавили.
 *
 * Описание и цели живут в заметке _core.md, а не в отдельном поле: этот файл
 * целиком уходит в промпт каждого агента, поэтому «описание проекта для человека»
 * и «постоянный контекст для моделей» — это один и тот же текст, и разводить их
 * в два места значит гарантированно их рассинхронизировать.
 */
export function WorkspaceContext({ projects, project, onProjectChange, onChanged }: WorkspaceContextProps) {
	const ids = { id: useId(), title: useId(), core: useId(), note: useId(), file: useId(), question: useId() }
	const fileRef = useRef<HTMLInputElement>(null)

	// Состояние формы инициализируется пропсами один раз: пространство меняется
	// снаружи через key={project}, поэтому компонент пересоздаётся с чистыми полями
	// и синхронизировать их эффектом не нужно.
	const [wsId, setWsId] = useState(project)
	const [wsTitle, setWsTitle] = useState(projects.find((p) => p.id === project)?.title ?? '')
	const [wsStatus, setWsStatus] = useState('')

	const [context, setContext] = useState<ContextOut | null>(null)
	const [core, setCore] = useState('')
	const [noteName, setNoteName] = useState(CORE)
	const [noteText, setNoteText] = useState('')
	const [noteStatus, setNoteStatus] = useState('')

	const [question, setQuestion] = useState('')
	const [uploadStatus, setUploadStatus] = useState('')
	const [busy, setBusy] = useState(false)

	const applyContext = useCallback((data: ContextOut) => {
		setContext(data)
		setCore(data.notes[CORE] ?? '')
	}, [])

	// Перечитать контекст после сохранения: обработчик, а не эффект.
	const reloadContext = useCallback(async () => {
		if (!project) return
		applyContext(await fleetApi.context(project))
	}, [project, applyContext])

	useEffect(() => {
		if (!project) return
		let alive = true
		fleetApi
			.context(project)
			.then((data) => alive && applyContext(data))
			.catch((e: unknown) => alive && setWsStatus(e instanceof Error ? e.message : String(e)))
		return () => {
			alive = false
		}
	}, [project, applyContext])

	const saveWorkspace = async () => {
		setBusy(true)
		setWsStatus('')
		try {
			const saved = await fleetApi.saveProject({ id: wsId, title: wsTitle })
			await onChanged()
			if (saved.id) onProjectChange(saved.id)
			setWsStatus('сохранено')
			setTimeout(() => setWsStatus(''), 2000)
		} catch (e) {
			setWsStatus(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const deleteWorkspace = async () => {
		if (!project) return
		if (!window.confirm(`Убрать пространство «${project}»? Заметки останутся на диске.`)) return
		setBusy(true)
		try {
			await fleetApi.deleteProject(project)
			await onChanged()
			onProjectChange('')
		} catch (e) {
			setWsStatus(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const saveNote = async (name: string, text: string) => {
		if (!project) return
		setBusy(true)
		setNoteStatus('')
		try {
			await fleetApi.saveNote(project, name, text)
			await reloadContext()
			setNoteStatus('сохранено')
			setTimeout(() => setNoteStatus(''), 2000)
		} catch (e) {
			setNoteStatus(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const upload = async () => {
		const file = fileRef.current?.files?.[0]
		if (!file || !project) {
			setUploadStatus('выбери файл')
			return
		}
		setBusy(true)
		setUploadStatus('разбираю…')
		try {
			const result = await fleetApi.upload(project, file, question)
			// Черновик кладём в редактор, а не в контекст: сохраняет его человек, прочитав.
			setNoteName(result.name)
			setNoteText(result.note)
			setUploadStatus(`${result.kind} · ${result.model} — проверь текст и сохрани`)
		} catch (e) {
			setUploadStatus(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const notes = Object.keys(context?.notes ?? {})

	return (
		<div className="flex flex-col gap-3">
			<GlassCard title="Рабочее пространство" subtitle="проект со своим контекстом и своей памятью">
				<div className="mt-3 flex flex-wrap items-end gap-3">
					<Field label="Идентификатор" id={ids.id} className="w-56">
						<TextInput
							id={ids.id}
							value={wsId}
							placeholder="my-project"
							onChange={(e) => setWsId(e.target.value)}
						/>
					</Field>
					<Field label="Название" id={ids.title} className="min-w-64 grow">
						<TextInput
							id={ids.title}
							value={wsTitle}
							placeholder="Как называется и о чём проект в двух словах"
							onChange={(e) => setWsTitle(e.target.value)}
						/>
					</Field>
					<button
						type="button"
						onClick={saveWorkspace}
						disabled={busy || wsId.trim() === ''}
						className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
					>
						Сохранить
					</button>
					<button
						type="button"
						onClick={() => {
							setWsId('')
							setWsTitle('')
						}}
						className="cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 transition hover:bg-white/10"
					>
						Новое
					</button>
					<button
						type="button"
						onClick={deleteWorkspace}
						disabled={busy || !project}
						className="cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm text-rose-400 ring-1 ring-rose-400/30 transition hover:bg-white/10 disabled:opacity-40"
					>
						Удалить
					</button>
					<span className="pb-2 text-sm text-slate-400">{wsStatus}</span>
				</div>
			</GlassCard>

			<GlassCard
				title="Описание и цели проекта"
				subtitle="уходит в промпт каждого агента целиком — здесь стек, соглашения и что сейчас делаем"
			>
				<Field label={CORE} id={ids.core} className="mt-3">
					<TextArea
						id={ids.core}
						rows={12}
						value={core}
						placeholder="Что это за проект, зачем он, на чём написан, какие правила и что считать готовым."
						onChange={(e) => setCore(e.target.value)}
						className="font-mono"
					/>
				</Field>
				<button
					type="button"
					onClick={() => saveNote(CORE, core)}
					disabled={busy || !project}
					className="mt-2 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
				>
					Сохранить описание
				</button>
			</GlassCard>

			<GlassCard title="Материалы" subtitle="скриншот, макет, схема, лог, csv, json, кусок кода">
				<div className="mt-3 flex flex-wrap items-end gap-3">
					<Field label="Файл" id={ids.file} className="min-w-64 grow">
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
						className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
					>
						Разобрать в заметку
					</button>
					<span className="pb-2 text-sm text-slate-400">{uploadStatus}</span>
				</div>
				<Field
					label="Что вытащить из материала"
					id={ids.question}
					className="mt-2"
					hint="Необязательно. Например: «интересует только схема ответа и коды ошибок»"
				>
					<TextInput id={ids.question} value={question} onChange={(e) => setQuestion(e.target.value)} />
				</Field>
				<p className="mt-2 text-xs text-slate-400">
					Картинку смотрит зрячий агент, текст сжимает condenser — обе роли бесплатные. Оригинал остаётся на
					диске, в контекст уедет только выжимка, и только когда ты её сохранишь.
				</p>
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
							<span className="block font-mono text-[11px] text-slate-400">
								{(context?.notes[name] ?? '').length} символов
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
							onClick={() => saveNote(noteName, noteText)}
							disabled={busy || !project || noteName.trim() === ''}
							className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
						>
							Сохранить
						</button>
						<span className="pb-2 text-sm text-slate-400">{noteStatus}</span>
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
