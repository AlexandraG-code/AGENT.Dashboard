'use client'

import { Button } from 'antd'
import { useTranslation } from 'react-i18next'

import type { StatsOut } from '@/shared/api'
import { buildModelColors } from '@/shared/config'
import { duration, money, tokens } from '@/shared/lib/format'
import { Panel, StatTile } from '@/shared/ui'

import { BreakdownTable } from './BreakdownTable'
import { DailySpend } from './DailySpend'
import { ModelBreakdown } from './ModelBreakdown'
import { ProjectBreakdown } from './ProjectBreakdown'
import styles from './StatsOverview.module.scss'

interface IStatsOverviewProps {
	stats: StatsOut
	titles: Record<string, string>
	project: string
}

/**
 * Сводная страница расходов: плитки итогов, график по дням и разрезы.
 * Все блоки считаются от одной выборки — её отдаёт бэкенд одним запросом,
 * поэтому цифры на плитках, полосах и в таблице сходятся между собой.
 *
 * @param stats — статистика за окно по выбранной выборке
 * @param titles — человеческие названия пространств
 * @param project — выбранное пространство; пустая строка означает «все проекты»
 */
export function StatsOverview({ stats, titles, project }: IStatsOverviewProps) {
	const { t } = useTranslation()
	const colors = buildModelColors(Object.keys(stats.models))
	const paidCalls = Object.values(stats.models).reduce((sum, model) => sum + (model.cost > 0 ? model.calls : 0), 0)

	return (
		<div className={styles.page}>
			<div className={styles.reportHead}>
				<div className={styles.printOnly}>
					<h2>{t('overview.reportTitle')}</h2>
					<p>
						{t('overview.reportMeta', {
							date: new Date().toLocaleString('ru-RU'),
							days: stats.daily.length,
							scope: project
								? t('overview.scopeOne', { name: titles[project] ?? project })
								: t('overview.scopeAll')
						})}
					</p>
				</div>
				<Button onClick={() => window.print()}>{t('overview.exportPdf')}</Button>
			</div>

			<div className={styles.tiles}>
				<StatTile
					label={t('overview.callsTotal')}
					value={String(stats.total.calls)}
					hint={t('overview.callsDaily', { count: stats.total_24h.calls })}
				/>
				<StatTile
					label={t('overview.spent')}
					value={money(stats.total.cost)}
					hint={t('overview.spentDaily', { amount: money(stats.total_24h.cost) })}
					tone={stats.total.cost > 0 ? 'neutral' : 'good'}
				/>
				<StatTile
					label={t('overview.tokensIn')}
					value={tokens(stats.total.tokens_in)}
					hint={t('overview.fromCache', { amount: tokens(stats.total.tokens_cached) })}
				/>
				<StatTile
					label={t('overview.tokensOut')}
					value={tokens(stats.total.tokens_out)}
					hint={t('overview.reasoningHint', { amount: tokens(stats.total.tokens_reasoning) })}
				/>
				<StatTile
					label={t('overview.paidCalls')}
					value={t('overview.paidValue', { paid: paidCalls, total: stats.total.calls })}
					hint={t('overview.paidHint')}
					tone="good"
				/>
				<StatTile
					label={t('overview.errors')}
					value={String(stats.total.errors)}
					hint={t('overview.timeInModels', { duration: duration(stats.total.seconds) })}
					tone={stats.total.errors > 0 ? 'bad' : 'good'}
				/>
			</div>

			<Panel title={t('overview.daily')} subtitle={t('overview.dailyHint', { days: stats.daily.length })}>
				<DailySpend days={stats.daily} />
			</Panel>

			<div className={styles.columns}>
				<Panel title={t('overview.byModel')} subtitle={t('overview.byModelHint')}>
					<ModelBreakdown models={stats.models} colors={colors} />
				</Panel>
				<Panel title={t('overview.byProject')} subtitle={t('overview.byProjectHint')}>
					<ProjectBreakdown projects={stats.projects} colors={colors} titles={titles} />
				</Panel>
			</div>

			<Panel title={t('overview.table')} subtitle={t('overview.tableHint')}>
				<BreakdownTable projects={stats.projects} titles={titles} />
			</Panel>
		</div>
	)
}
