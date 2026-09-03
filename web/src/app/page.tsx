'use client'

import { useEffect, useState } from 'react'

import { useFleetStore, useStats } from '@/shared/model'
import { Tabs } from '@/shared/ui/Tabs'
import { CallDetails, CallFeed } from '@/widgets/call-feed'
import { AgentEditor } from '@/widgets/agent-editor'
import { ClaudeUsage } from '@/widgets/claude-usage'
import { ProviderLimits } from '@/widgets/provider-limits'
import { RunTask } from '@/widgets/run-task'
import { StatsOverview } from '@/widgets/stats-overview'
import { WorkspaceContext } from '@/widgets/workspace-context'

const TABS = [
	{ id: 'overview', label: 'Обзор' },
	{ id: 'feed', label: 'Лента' },
	{ id: 'run', label: 'Запуск' },
	{ id: 'agents', label: 'Агенты' },
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
					<h1 className="text-[15px] font-semibold tracking-wide">
						AGENT<span className="text-emerald-400">.</span>Dashboard
					</h1>
				</div>

				<div className="grow" />

				<label className="text-[11px] tracking-wide text-slate-400 uppercase" htmlFor="project">
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
					<AgentEditor roles={state?.roles ?? []} models={state?.models ?? {}} onChanged={load} />
				)}
				{tab === 'context' && (
					<WorkspaceContext
						key={project}
						projects={state?.projects ?? []}
						project={project}
						onProjectChange={setProject}
						onChanged={load}
					/>
				)}
				<CallDetails callId={openCall} onClose={() => setOpenCall(null)} />
			</main>
		</div>
	)
}
