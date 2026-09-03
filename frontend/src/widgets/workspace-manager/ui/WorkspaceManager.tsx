'use client'

import { useEffect, useId, useState } from 'react'

import { fleetApi, type ProjectOut } from '@/shared/api'
import { cn } from '@/shared/lib/cn'
import { Field, TextArea, TextInput } from '@/shared/ui/Field'
import { GlassCard } from '@/shared/ui/GlassCard'

interface WorkspaceManagerProps {
	projects: ProjectOut[]
	project: string
	onProjectChange: (id: string) => void
	onChanged: () => Promise<void> | void
}

const CORE = '_core.md'
const RULES = '_rules.md'

/**
 * Пространства: здесь они заводятся и здесь описываются.
 *
 * Описание и правила — это две заметки (`_core.md` и `_rules.md`), которые целиком
 * уходят в промпт каждого агента. Отдельного «поля описания» в базе нет намеренно:
 * иначе текст для человека и текст для моделей разъедутся в первый же день.
 */
export function WorkspaceManager({ projects, project, onProjectChange, onChanged }: WorkspaceManagerProps) {
	const ids = { id: useId(), title: useId(), core: useId(), rules: useId(), repo: useId() }

	const [selected, setSelected] = useState<string | null>(project || null)
	const [wsId, setWsId] = useState(project)
	const [wsTitle, setWsTitle] = useState(projects.find((p) => p.id === project)?.title ?? '')
	const [core, setCore] = useState('')
	const [rules, setRules] = useState('')
	const [repo, setRepo] = useState('')
	const [compress, setCompress] = useState(true)
	const [status, setStatus] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (selected === null) return
		let alive = true
		fleetApi
			.context(selected)
			.then((data) => {
				if (!alive) return
				setCore(data.notes[CORE] ?? '')
				setRules(data.notes[RULES] ?? '')
			})
			.catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
		return () => {
			alive = false
		}
	}, [selected])

	const pick = (id: string) => {
		const found = projects.find((p) => p.id === id)
		setSelected(id)
		setWsId(id)
		setWsTitle(found?.title ?? '')
		setStatus('')
		setError('')
	}

	const startNew = () => {
		setSelected(null)
		setWsId('')
		setWsTitle('')
		setCore('')
		setRules('')
		setStatus('')
		setError('')
	}

	const save = async () => {
		setBusy(true)
		setError('')
		try {
			const saved = await fleetApi.saveProject({ id: wsId, title: wsTitle })
			const id = saved.id ?? wsId
			// Описание и правила сохраняем всегда: для нового пространства это и есть его смысл.
			await fleetApi.saveNote(id, CORE, core)
			await fleetApi.saveNote(id, RULES, rules)
			await onChanged()
			setSelected(id)
			onProjectChange(id)
			setStatus('сохранено')
			setTimeout(() => setStatus(''), 2000)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const remove = async () => {
		if (selected === null) return
		if (!window.confirm(`Убрать пространство «${selected}»? Заметки останутся на диске.`)) return
		setBusy(true)
		try {
			await fleetApi.deleteProject(selected)
			await onChanged()
			startNew()
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const importRules = async () => {
		if (selected === null) {
			setError('Сначала сохрани пространство — правилам нужно куда ложиться')
			return
		}
		setBusy(true)
		setError('')
		setStatus('читаю репозиторий…')
		try {
			const result = await fleetApi.importRules(selected, repo, compress)
			setRules(result.note)
			setStatus(`собрано из: ${result.source} — проверь текст и сохрани`)
		} catch (e) {
			setStatus('')
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="grid items-start gap-3 lg:grid-cols-[240px_1fr]">
			<div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-xl">
				{projects.map((p) => (
					<button
						key={p.id}
						type="button"
						onClick={() => pick(p.id)}
						className={cn(
							'block w-full cursor-pointer border-b border-white/5 px-4 py-2.5 text-left transition last:border-0 hover:bg-white/5',
							selected === p.id && 'bg-white/10 shadow-[inset_3px_0_0] shadow-emerald-500'
						)}
					>
						<span className="text-sm text-slate-100">{p.title.split(' — ')[0]}</span>
						<span className="block font-mono text-xs text-slate-400">{p.id}</span>
					</button>
				))}
				<button
					type="button"
					onClick={startNew}
					className="block w-full cursor-pointer px-4 py-2.5 text-left text-sm font-medium text-emerald-400 transition hover:bg-white/5"
				>
					+ новое пространство
				</button>
			</div>

			<div className="flex flex-col gap-3">
				<GlassCard title={selected ? 'Пространство' : 'Новое пространство'}>
					<div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr]">
						<Field label="Идентификатор" id={ids.id} hint="латиницей, менять потом нельзя">
							<TextInput
								id={ids.id}
								value={wsId}
								readOnly={selected !== null}
								placeholder="my-project"
								onChange={(e) => setWsId(e.target.value)}
							/>
						</Field>
						<Field label="Название" id={ids.title}>
							<TextInput
								id={ids.title}
								value={wsTitle}
								placeholder="Как называется и о чём проект в двух словах"
								onChange={(e) => setWsTitle(e.target.value)}
							/>
						</Field>
					</div>
				</GlassCard>

				<GlassCard
					title="Описание и цели"
					subtitle="уходит в промпт каждого агента: что за проект, зачем он и что сейчас делаем"
				>
					<Field label={CORE} id={ids.core} className="mt-3">
						<TextArea
							id={ids.core}
							rows={10}
							value={core}
							placeholder="Что это за проект, зачем он, на чём написан, какая сейчас цель."
							onChange={(e) => setCore(e.target.value)}
							className="font-mono"
						/>
					</Field>
				</GlassCard>

				<GlassCard
					title="Правила и соглашения"
					subtitle="как здесь принято писать код: стек, стиль, запреты, границы"
				>
					<div className="mt-3 flex flex-wrap items-end gap-3">
						<Field
							label="Путь к репозиторию"
							id={ids.repo}
							className="min-w-72 grow"
							hint="Соберу CLAUDE.md, AGENTS.md, .claude/rules/*.md, .cursorrules и сожму в свод"
						>
							<TextInput
								id={ids.repo}
								value={repo}
								placeholder="/Users/alex/WebstormProjects/мой-проект"
								onChange={(e) => setRepo(e.target.value)}
							/>
						</Field>
						<label className="flex items-center gap-2 pb-2 text-sm">
							<input
								type="checkbox"
								checked={compress}
								onChange={(e) => setCompress(e.target.checked)}
								className="h-4 w-4 accent-emerald-500"
							/>
							сжать выжимкой
						</label>
						<button
							type="button"
							onClick={importRules}
							disabled={busy || repo.trim() === ''}
							className="mb-2 cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-40"
						>
							Подтянуть из репозитория
						</button>
					</div>
					<Field label={RULES} id={ids.rules}>
						<TextArea
							id={ids.rules}
							rows={12}
							value={rules}
							placeholder="Правила, которых агенты обязаны держаться. Можно написать руками или собрать из репозитория."
							onChange={(e) => setRules(e.target.value)}
							className="font-mono"
						/>
					</Field>
				</GlassCard>

				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={save}
						disabled={busy || wsId.trim() === ''}
						className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
					>
						Сохранить пространство
					</button>
					<button
						type="button"
						onClick={remove}
						disabled={busy || selected === null}
						className="cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm text-rose-400 ring-1 ring-rose-400/30 transition hover:bg-white/10 disabled:opacity-40"
					>
						Удалить
					</button>
					{status && <span className="text-sm text-emerald-400">{status}</span>}
					{error && <span className="text-sm text-rose-400">{error}</span>}
				</div>
			</div>
		</div>
	)
}
