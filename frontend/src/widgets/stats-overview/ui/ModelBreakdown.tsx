'use client'

import { useTranslation } from 'react-i18next'

import type { ModelStat } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'
import { MetricBar, SeriesDot } from '@/shared/ui'

import { modelRows, peakOf, totalTokens } from '../lib/breakdown'
import styles from './Breakdown.module.scss'

interface IModelBreakdownProps {
	models: Record<string, ModelStat>
	colors: Record<string, string>
}

/**
 * Сколько сожрала каждая модель по всем проектам сразу. Имя модели стоит рядом
 * со своей полосой, поэтому легенда не нужна, а идентичность не держится на цвете.
 *
 * @param models — разрез статистики по моделям
 * @param colors — цвет серии для каждой модели из общей палитры
 */
export function ModelBreakdown({ models, colors }: IModelBreakdownProps) {
	const { t } = useTranslation()
	const rows = modelRows(models)

	if (rows.length === 0) {
		return <p>{t('common.empty')}</p>
	}

	const peak = peakOf(rows, ([, stat]) => totalTokens(stat))

	return (
		<ul className={styles.rows}>
			{rows.map(([name, stat]) => (
				<li key={name} className={styles.row}>
					<div className={styles.head}>
						<span className={styles.name}>
							<SeriesDot color={colors[name] ?? 'var(--text-mute)'} />
							{name}
						</span>
						<span className={styles.numbers}>
							{stat.calls} · {money(stat.cost)}
						</span>
					</div>
					<MetricBar
						widthPercent={(totalTokens(stat) / peak) * 100}
						segments={[
							{
								key: 'in',
								value: stat.tokens_in,
								color: colors[name] ?? 'var(--text-mute)',
								title: `${t('common.input')} ${tokens(stat.tokens_in)}`
							},
							{
								key: 'out',
								value: stat.tokens_out,
								color: colors[name] ?? 'var(--text-mute)',
								dim: true,
								title: `${t('common.output')} ${tokens(stat.tokens_out)}`
							}
						]}
					/>
					<span className={styles.numbers}>
						{t('common.input')} {tokens(stat.tokens_in)} · {t('common.output')} {tokens(stat.tokens_out)}
						{stat.tokens_cached > 0 && ` · ${t('common.cached')} ${tokens(stat.tokens_cached)}`}
					</span>
				</li>
			))}
		</ul>
	)
}
