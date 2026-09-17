'use client'

import { useTranslation } from 'react-i18next'

import type { ClaudeStat } from '@/shared/api'
import { tokens } from '@/shared/lib/format'
import { KeyValues, MetricBar, Panel } from '@/shared/ui'

import styles from './ClaudeUsage.module.scss'

interface IClaudeUsageProps {
	claude: ClaudeStat
}

/**
 * Расход самого Claude Code — того, кто раздаёт задачи команде. Цифры берутся из
 * журналов его сессий, а не из нашего клиента, поэтому стоимость не показывается:
 * работа идёт по подписке, цены за токен нет, и выдумывать её в отчёте нельзя.
 *
 * Окна расхода («за 5 часов», «за неделю») показывают ОБЪЁМ работы, а не остаток
 * лимита: сколько подписка разрешает, Claude Code наружу не отдаёт, а проценты
 * от выдуманного потолка — это враньё в отчёте.
 *
 * @param claude — сводка по сессиям Claude Code за окно статистики
 */
export function ClaudeUsage({ claude }: IClaudeUsageProps) {
	const { t } = useTranslation()

	if (!claude.available) {
		return null
	}

	const folders = Object.entries(claude.projects)
		.sort((a, b) => b[1].tokens_in + b[1].tokens_out - (a[1].tokens_in + a[1].tokens_out))
		.slice(0, 8)
	const peak = Math.max(...folders.map(([, slot]) => slot.tokens_in + slot.tokens_out), 1)

	return (
		<Panel title={t('claude.title')} subtitle={t('claude.subtitle')}>
			<KeyValues
				minWidth={120}
				items={[
					{ key: 'calls', label: t('claude.answers'), value: String(claude.total.calls) },
					{ key: 'in', label: t('common.input'), value: tokens(claude.total.tokens_in) },
					{
						key: 'cached',
						label: t('common.cached'),
						value: tokens(claude.total.tokens_cached),
						tone: 'good'
					},
					{ key: 'out', label: t('common.output'), value: tokens(claude.total.tokens_out) },
					{ key: 'think', label: t('common.reasoning'), value: tokens(claude.total.tokens_reasoning) }
				]}
			/>

			<p className={styles.caption}>{t('claude.windows')}</p>
			<div className={styles.windows}>
				{(['h5', 'd7'] as const).map((name) => {
					const slot = claude.windows?.[name]
					return (
						<div key={name} className={styles.window}>
							<span className={styles.windowLabel}>{t(`claude.window_${name}`)}</span>
							<span className={styles.windowValue}>
								{t('claude.usage', {
									calls: slot?.calls ?? 0,
									in: tokens(slot?.tokens_in ?? 0),
									out: tokens(slot?.tokens_out ?? 0)
								})}
							</span>
						</div>
					)
				})}
			</div>
			<p className={styles.note}>{t('claude.windowsNote')}</p>

			<p className={styles.caption}>{t('claude.byFolder')}</p>
			<ul className={styles.rows}>
				{folders.map(([name, slot]) => (
					<li key={name} className={styles.row}>
						<div className={styles.head}>
							<span className={styles.name}>{name}</span>
							<span className={styles.numbers}>
								{tokens(slot.tokens_in)}→{tokens(slot.tokens_out)}
							</span>
						</div>
						<MetricBar
							widthPercent={((slot.tokens_in + slot.tokens_out) / peak) * 100}
							segments={[
								{
									key: 'in',
									value: slot.tokens_in,
									color: '#7c3aed',
									title: `${t('common.input')} ${tokens(slot.tokens_in)}`
								},
								{
									key: 'out',
									value: slot.tokens_out,
									color: '#7c3aed',
									dim: true,
									title: `${t('common.output')} ${tokens(slot.tokens_out)}`
								}
							]}
						/>
					</li>
				))}
			</ul>
		</Panel>
	)
}
