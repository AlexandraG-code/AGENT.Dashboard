'use client'

import { Alert, Select, Spin, Tabs } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFleetStore, useStats } from '@/shared/model'
import { AgentEditor, ArchitectCard } from '@/widgets/agent-editor'
import { CallDetails, CallFeed } from '@/widgets/call-feed'
import { ClaudeUsage } from '@/widgets/claude-usage'
import { ModelRegistry, ProviderRegistry } from '@/widgets/model-registry'
import { ProviderLimits } from '@/widgets/provider-limits'
import { RunTask } from '@/widgets/run-task'
import { StatsOverview } from '@/widgets/stats-overview'
import { UiSettings } from '@/widgets/ui-settings'
import { WorkspaceContext } from '@/widgets/workspace-context'
import { WorkspaceManager } from '@/widgets/workspace-manager'

import styles from './page.module.scss'
import { useBootstrap } from './useBootstrap'

/** Дашборд флота: шапка с выбором пространства и вкладки разделов. */
export default function DashboardPage() {
	const { state, project, setProject, load, error } = useFleetStore()
	const { stats, error: statsError } = useStats(project)
	const [openCall, setOpenCall] = useState<string | null>(null)
	const { t } = useTranslation()

	useBootstrap(load)

	const titles = Object.fromEntries((state?.projects ?? []).map((item) => [item.id, item.title.split(' — ')[0]]))
	const roles = state?.roles ?? []
	const models = state?.models ?? {}
	const providers = state?.providers ?? []
	const projects = state?.projects ?? []

	const overview = statsError ? (
		<Alert type="error" message={t('overview.statsFailed', { error: statsError })} />
	) : stats ? (
		<>
			<StatsOverview stats={stats} titles={titles} project={project} />
			<ClaudeUsage claude={stats.claude} />
			<ProviderLimits models={models} stats={stats} balance={state?.balance ?? null} />
		</>
	) : (
		<Spin description={t('overview.counting')} />
	)

	const items = [
		{ key: 'overview', label: t('tabs.overview'), children: overview },
		{ key: 'feed', label: t('tabs.feed'), children: <CallFeed onSelect={setOpenCall} /> },
		{ key: 'run', label: t('tabs.run'), children: <RunTask roles={roles} project={project} /> },
		{
			key: 'agents',
			label: t('tabs.agents'),
			children: (
				<>
					<ArchitectCard claude={stats?.claude} />
					<AgentEditor roles={roles} models={models} onChanged={load} />
				</>
			)
		},
		{
			key: 'models',
			label: t('tabs.models'),
			children: (
				<>
					<ProviderRegistry providers={providers} onChanged={load} />
					<ModelRegistry models={models} providers={providers} onChanged={load} />
				</>
			)
		},
		{
			key: 'spaces',
			label: t('tabs.spaces'),
			children: (
				<WorkspaceManager
					projects={projects}
					project={project}
					onProjectChange={setProject}
					onChanged={load}
				/>
			)
		},
		{
			key: 'context',
			label: t('tabs.context'),
			children: (
				<WorkspaceContext
					key={project}
					projects={projects}
					project={project}
					onProjectChange={setProject}
				/>
			)
		}
	]

	return (
		<div className={styles.shell}>
			<header className={styles.header}>
				<h1 className={styles.brand}>
					<span className={styles.scene} aria-hidden>
						<span className={styles.cube}>
							<i />
							<i />
							<i />
							<i />
							<i />
							<i />
						</span>
					</span>
					AGENT<span className={styles.dot}>.</span>Dashboard
				</h1>
				<span className={styles.spacer} />
				<UiSettings />
				<label className={styles.spaceLabel} htmlFor="project">
					{t('app.space')}
				</label>
				<Select
					id="project"
					className={styles.spaceSelect}
					value={project}
					onChange={setProject}
					options={[
						{ value: '', label: t('app.allSpaces') },
						...projects.map((item) => ({ value: item.id, label: item.title.split(' — ')[0] }))
					]}
				/>
			</header>

			{error && <Alert type="error" message={t('app.backendDown', { error })} />}

			<Tabs className={styles.tabs} items={items} destroyOnHidden />

			<CallDetails callId={openCall} onClose={() => setOpenCall(null)} />
		</div>
	)
}
