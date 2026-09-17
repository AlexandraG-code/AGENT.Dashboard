'use client'

import { Alert, Popover, Select, Spin, Tabs } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFleetStore, useStats } from '@/shared/model'
import { NeuralGlobe } from '@/shared/ui'
import { AgentEditor } from '@/widgets/agent-editor'
import { CallDetails, CallFeed } from '@/widgets/call-feed'
import { ActivityBadge, ActivityPanel, JobChat, useActivity } from '@/widgets/fleet-activity'
import { ClaudeUsage } from '@/widgets/claude-usage'
import { ModelRegistry, ProviderRegistry } from '@/widgets/model-registry'
import { OrgStructure } from '@/widgets/org-structure'
import { ProviderLimits } from '@/widgets/provider-limits'
import { RunTask } from '@/widgets/run-task'
import { StatsOverview } from '@/widgets/stats-overview'
import { TeamChart, useTeamChart } from '@/widgets/team-chart'
import { TeamChat } from '@/widgets/team-chat'
import { UiSettings } from '@/widgets/ui-settings'
import { WorkspaceContext } from '@/widgets/workspace-context'
import { WorkspaceManager } from '@/widgets/workspace-manager'

import styles from './page.module.scss'
import { useBootstrap } from './useBootstrap'
import { useTabMemory } from './useTabMemory'

/** Дашборд команды: шапка с выбором пространства и вкладки разделов. */
export default function DashboardPage() {
	const { state, project, setProject, load, error } = useFleetStore()
	const { stats, error: statsError } = useStats(project)
	const [openCall, setOpenCall] = useState<string | null>(null)
	const [openJob, setOpenJob] = useState<string | null>(null)
	const activity = useActivity()
	const chart = useTeamChart(project)
	const tab = useTabMemory((state) => state.tab)
	const setTab = useTabMemory((state) => state.set)
	const restore = useTabMemory((state) => state.restore)
	const { t } = useTranslation()

	useBootstrap(load)

	// Вкладку поднимаем после монтирования: на сервере ни адреса страницы,
	// ни localStorage нет, а действие стора не считается setState в эффекте.
	useEffect(() => {
		restore('overview')
	}, [restore])

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
			key: 'chat',
			label: t('tabs.chat'),
			children: <TeamChat project={project} roles={roles} />
		},
		{
			key: 'agents',
			label: t('tabs.agents'),
			children: (
				<>
					<AgentEditor key={project} project={project} roles={roles} models={models} onChanged={load} />
					<TeamChart chart={chart} />
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
			key: 'org',
			label: t('tabs.org'),
			children: <OrgStructure key={project} project={project} />
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
					<NeuralGlobe className={styles.mark} />
					AGENT<span className={styles.dot}>.</span>Dashboard
				</h1>
				<span className={styles.spacer} />
				<div className={styles.controls}>
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
					<Popover
						trigger="click"
						placement="bottomRight"
						title={t('activity.title')}
						content={
							<ActivityPanel
								byProject={activity.byProject}
								recent={activity.recent}
								titles={titles}
								onOpen={setOpenJob}
							/>
						}
					>
						<span className={styles.activity}>
							<ActivityBadge count={activity.active} onClick={() => undefined} />
						</span>
					</Popover>
					<UiSettings />
				</div>
			</header>

			{error && <Alert className={styles.alert} type="error" message={t('app.backendDown', { error })} />}

			<Tabs
				className={styles.tabs}
				items={items}
				destroyOnHidden
				activeKey={tab || 'overview'}
				onChange={setTab}
			/>

			<CallDetails callId={openCall} onClose={() => setOpenCall(null)} />

			<JobChat
				job={activity.jobs.find((job) => job.id === openJob) ?? null}
				onClose={() => setOpenJob(null)}
			/>
		</div>
	)
}
