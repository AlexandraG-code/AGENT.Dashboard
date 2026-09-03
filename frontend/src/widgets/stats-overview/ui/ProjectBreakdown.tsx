'use client'

import { useTranslation } from 'react-i18next'

import type { ProjectStat } from '@/shared/api'
import { money, percent, tokens } from '@/shared/lib/format'
import { MetricBar, SeriesDot } from '@/shared/ui'

import { peakOf, projectRows } from '../lib/breakdown'
import styles from './Breakdown.module.scss'

interface IProjectBreakdownProps {
	projects: Record<string, ProjectStat>
	colors: Record<string, string>
	titles: Record<string, string>
}

/**
 * Расход по проектам, внутри проекта — доли моделей тем же цветом, что и в разрезе
 * по моделям: цвет закреплён за моделью, а не за её местом в рейтинге.
 *
 * @param projects — разрез статистики по проектам
 * @param colors — цвет серии для каждой модели
 * @param titles — человеческие названия пространств: в журнале лежат идентификаторы
 */
export function ProjectBreakdown({ projects, colors, titles }: IProjectBreakdownProps) {
	const { t } = useTranslation()
	const { rows, totalCost } = projectRows(projects)

	if (rows.length === 0) {
		return <p>{t('common.empty')}</p>
	}

	const peak = peakOf(rows, ([, stat]) => stat.cost)
	const nameOf = (id: string) => titles[id] ?? (id === '—' ? t('overview.noSpace') : id)

	return (
		<ul className={styles.rows}>
			{rows.map(([id, stat]) => (
				<li key={id} className={styles.row}>
					<div className={styles.head}>
						<span className={styles.name}>{nameOf(id)}</span>
						<span className={styles.numbers}>
							{money(stat.cost)} · {percent(stat.cost, totalCost)} · {stat.calls}
						</span>
					</div>
					<MetricBar
						widthPercent={(stat.cost / peak) * 100}
						segments={Object.entries(stat.by_model).map(([model, slot]) => ({
							key: model,
							value: slot.tokens_in + slot.tokens_out,
							color: colors[model] ?? 'var(--text-mute)',
							title: `${model}: ${money(slot.cost)}, ${tokens(slot.tokens_in)}→${tokens(slot.tokens_out)}`
						}))}
					/>
					<div className={styles.legend}>
						{Object.entries(stat.by_model).map(([model, slot]) => (
							<span key={model} className={styles.legendItem}>
								<SeriesDot color={colors[model] ?? 'var(--text-mute)'} />
								{model}: {tokens(slot.tokens_in)}→{tokens(slot.tokens_out)}
							</span>
						))}
					</div>
				</li>
			))}
		</ul>
	)
}
