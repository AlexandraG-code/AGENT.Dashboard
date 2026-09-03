'use client'

import { useEffect, useState } from 'react'

import { tokens } from '@/shared/lib/format'
import { useFleetStore, useStats } from '@/shared/model'
import { Tabs } from '@/shared/ui/Tabs'
import { CallDetails, CallFeed } from '@/widgets/call-feed'
import { AgentEditor } from '@/widgets/agent-editor'
import { ClaudeUsage } from '@/widgets/claude-usage'
import { ProviderLimits } from '@/widgets/provider-limits'
import { ModelRegistry, ProviderRegistry } from '@/widgets/model-registry'
import { RunTask } from '@/widgets/run-task'
import { StatsOverview } from '@/widgets/stats-overview'
import { UiSettings } from '@/widgets/ui-settings'
import { WorkspaceContext } from '@/widgets/workspace-context'
import { WorkspaceManager } from '@/widgets/workspace-manager'

const TABS = [
	{ id: 'overview', label: 'Обзор' },
	{ id: 'feed', label: 'Лента' },
	{ id: 'run', label: 'Запуск' },
	{ id: 'agents', label: 'Агенты' },
	{ id: 'models', label: 'Модели' },
	{ id: 'spaces', label: 'Пространства' },
	{ id: 'context', label: 'Контекст' }
]

export default function DashboardPage() {
	const { state, project, setProject, load, error } = useFleetStore()
	const [tab, setTab] = useState('overview')
	const [openCall, setOpenCall] = useState<string | null>(null)
	const { stats, error: statsError } = useStats(project)

	useEffect(() => {
		void load()
	}, [load])

	const titles = Object.fromEntries((state?.projects ?? []).map((p) => [p.id, p.title.split(' — ')[0]]))

	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 border-b border-white/10 bg-slate-900/60 px-6 py-3 backdrop-blur-xl">
				<div className="flex items-center gap-3">
					<div className="cube-scene h-[34px] w-[34px] shrink-0">
						<div className="cube relative h-full w-full">
							<i />
							<i />
							<i />
							<i />
							<i />
							<i />
						</div>
					</div>
					<h1 className="text-base font-semibold tracking-wide">
						AGENT<span className="text-emerald-400">.</span>Dashboard
					</h1>
				</div>

				<div className="grow" />

				<UiSettings />

				<label className="text-xs tracking-wide text-slate-400 uppercase" htmlFor="project">
					пространство
				</label>
				<select
					id="project"
					value={project}
					onChange={(e) => setProject(e.target.value)}
					className="rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
				>
					<option value="" className="bg-slate-900">
						Все проекты
					</option>
					{(state?.projects ?? []).map((p) => (
						<option key={p.id} value={p.id} className="bg-slate-900">
							{p.title.split(' — ')[0]}
						</option>
					))}
				</select>
			</header>

			<div className="px-6 pt-4">
				<Tabs items={TABS} value={tab} onChange={setTab} />
			</div>

			<main className="px-6 py-4 pb-16">
				{error && <p className="mb-3 text-sm text-rose-400">Бэкенд недоступен: {error}</p>}
				{tab === 'overview' && statsError && (
					<p className="mb-3 text-sm text-rose-400">Статистика недоступна: {statsError}</p>
				)}
				{tab === 'overview' && !stats && <p className="text-sm text-slate-400">Считаю статистику…</p>}
				{tab === 'overview' && stats && (
					<div className="flex flex-col gap-3">
						<StatsOverview titles={titles} project={project} stats={stats} />
						<ClaudeUsage claude={stats.claude} />
						<ProviderLimits models={state?.models ?? {}} stats={stats} balance={state?.balance ?? null} />
					</div>
				)}
				{tab === 'feed' && <CallFeed onSelect={setOpenCall} />}
				{tab === 'run' && <RunTask roles={state?.roles ?? []} project={project} />}
				{tab === 'agents' && (
					<div className="flex flex-col gap-3">
						{/* Claude в списке ролей отсутствует намеренно: он не ходит через флот,
						    но команда без него не читается — поэтому он показан отдельно. */}
						<div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur-xl">
							<div className="flex flex-wrap items-baseline gap-x-3">
								<h3 className="text-base font-semibold text-slate-100">
									Claude Code — главный архитектор
								</h3>
								<span className="font-mono text-xs text-slate-400">
									{Object.keys(stats?.claude.models ?? {}).join(', ') || 'claude'}
								</span>
								<span className="text-xs text-slate-400">внешний участник</span>
							</div>
							<p className="mt-2 text-sm text-slate-400">
								Раздаёт задачи, проверяет и применяет результат. Его настройки и промпт живут не здесь,
								а в самом Claude Code: файл CLAUDE.md проекта, правила в .claude/rules и его память.
								Здесь он показан, чтобы состав команды был виден целиком, а расход — на вкладке «Обзор».
							</p>
							{stats?.claude.available && (
								<p className="mt-2 font-mono text-xs text-slate-400 tabular-nums">
									{stats.claude.total.calls} ответов · вход {tokens(stats.claude.total.tokens_in)} ·
									выход {tokens(stats.claude.total.tokens_out)}
								</p>
							)}
						</div>
						<AgentEditor roles={state?.roles ?? []} models={state?.models ?? {}} onChanged={load} />
					</div>
				)}
				{tab === 'models' && (
					<div className="flex flex-col gap-3">
						<ProviderRegistry providers={state?.providers ?? []} onChanged={load} />
						<ModelRegistry
							models={state?.models ?? {}}
							providers={state?.providers ?? []}
							onChanged={load}
						/>
					</div>
				)}
				{tab === 'spaces' && (
					<WorkspaceManager
						projects={state?.projects ?? []}
						project={project}
						onProjectChange={setProject}
						onChanged={load}
					/>
				)}
				{tab === 'context' && (
					<WorkspaceContext
						key={project}
						projects={state?.projects ?? []}
						project={project}
						onProjectChange={setProject}
					/>
				)}
				<CallDetails callId={openCall} onClose={() => setOpenCall(null)} />
			</main>
		</div>
	)
}
