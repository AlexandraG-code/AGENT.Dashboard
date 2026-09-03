'use client'

import { useTranslation } from 'react-i18next'

import type { DayStat } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'

import { peakOf } from '../lib/breakdown'
import styles from './DailySpend.module.scss'

interface IDailySpendProps {
	days: DayStat[]
}

/**
 * Расход по дням. Серия одна, поэтому легенды нет — её заменяет заголовок панели;
 * подписана только вершина, иначе график превращается в таблицу.
 *
 * @param days — непрерывный ряд дней со стоимостью, вызовами и токенами
 */
export function DailySpend({ days }: IDailySpendProps) {
	const { t } = useTranslation()

	if (days.length === 0) {
		return <p>{t('common.empty')}</p>
	}

	const peak = peakOf(days, (day) => day.cost)
	const peakDay = days.reduce((best, day) => (day.cost > best.cost ? day : best), days[0])

	return (
		<div>
			<div className={styles.chart} role="img" aria-label={t('overview.daily')}>
				{days.map((day) => (
					<div key={day.date} className={styles.column}>
						<div
							className={styles.bar}
							style={{ '--bar-height': `${Math.max(2, (day.cost / peak) * 100)}%` } as React.CSSProperties}
						/>
						<span className={styles.tip}>
							<b>{day.date}</b>{' '}
							{t('overview.dayTooltip', {
								cost: money(day.cost),
								calls: day.calls,
								in: tokens(day.tokens_in),
								out: tokens(day.tokens_out)
							})}
						</span>
					</div>
				))}
			</div>
			<div className={styles.axis}>
				<span>{days[0]?.date}</span>
				<span>{t('overview.peak', { amount: money(peak), date: peakDay.date })}</span>
				<span>{days[days.length - 1]?.date}</span>
			</div>
		</div>
	)
}
