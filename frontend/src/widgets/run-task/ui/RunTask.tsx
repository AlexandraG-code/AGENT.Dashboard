'use client'

import { useId, useState } from 'react'

import { fleetApi, type RoleOut } from '@/shared/api'
import { duration, money, tokens } from '@/shared/lib/format'
import { Field, TextArea } from '@/shared/ui/Field'
import { GlassCard } from '@/shared/ui/GlassCard'

interface RunTaskProps {
	roles: RoleOut[]
	project: string
}

/**
 * Запуск задачи прямо из интерфейса: одним агентом или советом
 * (консультант предлагает, оппонент атакует). Контекст выбранного
 * пространства подмешивается на бэкенде, здесь его дублировать не нужно.
 */
export function RunTask({ roles, project }: RunTaskProps) {
	const ids = { role: useId(), mode: useId(), task: useId(), extra: useId() }
	const [role, setRole] = useState(roles[0]?.name ?? '')
	const [mode, setMode] = useState<'run' | 'council'>('run')
	const [task, setTask] = useState('')
	const [extra, setExtra] = useState('')
	const [out, setOut] = useState('')
	const [meta, setMeta] = useState('')
	const [busy, setBusy] = useState(false)

	const go = async () => {
		setBusy(true)
		setOut('')
		setMeta('работает…')
		try {
			if (mode === 'council') {
				const result = await fleetApi.council({ role, task, project, extra })
				setOut(result.transcript.map((t) => `### ${t.speaker} (${t.model})\n${t.text}`).join('\n\n'))
				setMeta(`совет · ${result.transcript.length} реплик · ${money(result.cost)}`)
			} else {
				const result = await fleetApi.run({ role, task, project, extra })
				setOut(result.text)
				setMeta(
					`${result.model} · ${tokens(result.tokens_in)}→${tokens(result.tokens_out)} ток.` +
						(result.reasoning > 0 ? ` (${tokens(result.reasoning)} размышления)` : '') +
						` · ${money(result.cost)} · ${duration(result.seconds)}`
				)
			}
		} catch (e) {
			setMeta('')
			setOut(`Ошибка: ${e instanceof Error ? e.message : String(e)}`)
		} finally {
			setBusy(false)
		}
	}

	return (
		<GlassCard>
			<div className="flex flex-wrap items-end gap-3">
				<Field label="Агент" id={ids.role} className="w-56">
					<select
						id={ids.role}
						value={role}
						onChange={(e) => setRole(e.target.value)}
						className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
					>
						{roles.map((r) => (
							<option key={r.name} value={r.name} className="bg-slate-900">
								{r.name} — {r.model}
							</option>
						))}
					</select>
				</Field>
				<Field label="Режим" id={ids.mode} className="w-72">
					<select
						id={ids.mode}
						value={mode}
						onChange={(e) => setMode(e.target.value === 'council' ? 'council' : 'run')}
						className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
					>
						<option value="run" className="bg-slate-900">
							один агент
						</option>
						<option value="council" className="bg-slate-900">
							совет (консультант ⇄ оппонент)
						</option>
					</select>
				</Field>
				<button
					type="button"
					onClick={go}
					disabled={busy || task.trim() === ''}
					className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
				>
					{busy ? 'Работает…' : 'Запустить'}
				</button>
				<span className="pb-2 font-mono text-xs text-slate-400">{meta}</span>
			</div>

			<Field
				label="Задача"
				id={ids.task}
				className="mt-3"
				hint="Пиши полно: что сделать, где, по каким правилам, что считать готовым."
			>
				<TextArea id={ids.task} rows={7} value={task} onChange={(e) => setTask(e.target.value)} />
			</Field>

			<Field label="Дополнительные материалы" id={ids.extra} className="mt-2" hint="Куски кода, ответы API, логи">
				<TextArea id={ids.extra} rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} />
			</Field>

			{out && (
				<pre className="mt-3 max-h-[60vh] overflow-auto rounded-xl bg-slate-950/60 p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap ring-1 ring-white/10">
					{out}
				</pre>
			)}
		</GlassCard>
	)
}
