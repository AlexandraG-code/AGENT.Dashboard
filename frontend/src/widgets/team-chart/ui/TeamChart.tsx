// файл: frontend/src/widgets/team-chart/ui/TeamChart.tsx
'use client'
// Написано агентом middle (deepseek-v4-pro) по ТЗ главного архитектора.

import { Button, Tag } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ChartOut } from '@/shared/api'
import { Panel } from '@/shared/ui'

import styles from './TeamChart.module.scss'

interface ITeamChartProps {
	chart: ChartOut | null
}

/**
 * Блок «Схема команды» для вкладки «Агенты».
 *
 * @param props - свойства компонента
 * @param props.chart - данные схемы команды или null, если данных нет
 */
export function TeamChart({ chart }: ITeamChartProps) {
	const { t } = useTranslation()

	if (chart === null) {
		return (
			<Panel
				title={t('chart.title')}
				subtitle={t('chart.subtitle')}
				tools={
					<Button href="/api/team/chart.md" download="схема-команды.md">
						{t('chart.download')}
					</Button>
				}
			>
				<p className={styles.empty}>{t('common.empty')}</p>
			</Panel>
		)
	}

	return (
		<Panel
			title={t('chart.title')}
			subtitle={t('chart.subtitle')}
			tools={
				<Button href="/api/team/chart.md" download="схема-команды.md">
					{t('chart.download')}
				</Button>
			}
		>
			<div className={styles.levels}>
				<h4 className={styles.level}>{t('chart.lead')}</h4>
				{chart.lead ? (
					<div className={styles.role} key={chart.lead.name}>
						<span className={styles.icon}>{chart.lead.icon || '🤖'}</span>
						<b>{chart.lead.name}</b>
						<span className={styles.model}>{chart.lead.model}</span>
						{chart.lead.external && <Tag>{t('chart.external')}</Tag>}
					</div>
				) : null}

				<h4 className={styles.level}>{t('chart.deputy')}</h4>
				{chart.deputy ? (
					<div className={styles.role} key={chart.deputy.name}>
						<span className={styles.icon}>{chart.deputy.icon || '🤖'}</span>
						<b>{chart.deputy.name}</b>
						<span className={styles.model}>{chart.deputy.model}</span>
						{chart.deputy.external && <Tag>{t('chart.external')}</Tag>}
					</div>
				) : null}

				<h4 className={styles.level}>{t('chart.council')}</h4>
				{chart.council.map((role) => (
					<div className={styles.role} key={role.name}>
						<span className={styles.icon}>{role.icon || '🤖'}</span>
						<b>{role.name}</b>
						<span className={styles.model}>{role.model}</span>
						{role.external && <Tag>{t('chart.external')}</Tag>}
					</div>
				))}

				<h4 className={styles.level}>{t('chart.workers')}</h4>
				{chart.workers.map((role) => (
					<div className={styles.role} key={role.name}>
						<span className={styles.icon}>{role.icon || '🤖'}</span>
						<b>{role.name}</b>
						<span className={styles.model}>{role.model}</span>
						{role.external && <Tag>{t('chart.external')}</Tag>}
					</div>
				))}
			</div>

			<h4 className={styles.level}>{t('chart.failover')}</h4>
			<ul className={styles.fails}>
				{chart.failover
					.filter((item) => item.on_fail.length > 0)
					.map((item) => (
						<li key={item.role}>
							<span className={styles.icon}>{item.icon || '🤖'}</span>
							<b>{item.role}</b>
							<span className={styles.steps}>{item.on_fail.join(' → ')}</span>
						</li>
					))}
			</ul>
		</Panel>
	)
}
