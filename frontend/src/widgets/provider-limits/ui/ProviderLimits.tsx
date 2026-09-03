'use client'

import { useTranslation } from 'react-i18next'

import type { ModelOut, StatsOut } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'
import { KeyValues, Panel } from '@/shared/ui'

import { daysLeft, usageByProvider } from '../lib/aggregate'
import styles from './ProviderLimits.module.scss'

interface IProviderLimitsProps {
	models: Record<string, ModelOut>
	stats: StatsOut
	balance: number | null
}

/**
 * Остатки и нагрузка по провайдерам. Про источники честно: DeepSeek отдаёт баланс
 * счёта — это настоящие деньги; z.ai остаток подписки через API не отдаёт, поэтому
 * по GLM показывается собственный расход и разрешённый тарифом параллелизм.
 *
 * @param models — реестр моделей: из него берётся принадлежность провайдеру
 * @param stats — статистика за окно, из неё считается расход
 * @param balance — остаток счёта DeepSeek или null, если получить не удалось
 */
export function ProviderLimits({ models, stats, balance }: IProviderLimitsProps) {
	const { t } = useTranslation()
	const forecast = daysLeft(balance, stats)

	return (
		<div className={styles.grid}>
			{usageByProvider(models, stats).map((usage) => {
				const paid = usage.cost > 0

				return (
					<Panel
						key={usage.provider}
						title={usage.provider === 'glm' ? t('providers.limitsTitleGlm') : usage.provider}
						subtitle={paid ? t('providers.paid') : t('providers.subscription')}
					>
						<KeyValues
							items={[
								{
									key: 'balance',
									label: t('providers.balance'),
									value: paid
										? balance === null
											? t('providers.noData')
											: `$${balance.toFixed(2)}`
										: t('providers.balanceNone'),
									tone: paid ? 'good' : 'dim'
								},
								{ key: 'spent', label: t('providers.spentTotal'), value: money(usage.cost) },
								{ key: 'calls', label: t('common.calls'), value: String(usage.calls) },
								{
									key: 'tokens',
									label: t('common.tokens'),
									value: `${tokens(usage.tokensIn)}→${tokens(usage.tokensOut)}`
								}
							]}
						/>

						{paid && forecast && (
							<p className={styles.forecast}>
								{t('providers.forecast', { perDay: money(forecast.perDay), days: forecast.days })}
							</p>
						)}

						<ul className={styles.models}>
							{usage.models.map((id) => (
								<li key={id} className={styles.modelRow}>
									<span className={styles.modelName}>{id}</span>
									<span className={styles.modelMeta}>
										{t('providers.concurrency', { count: models[id]?.concurrency ?? 0 })}
										{models[id]?.vision ? ` · ${t('providers.vision')}` : ''}
									</span>
								</li>
							))}
						</ul>
					</Panel>
				)
			})}
		</div>
	)
}
