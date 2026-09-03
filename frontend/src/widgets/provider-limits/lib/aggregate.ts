import type { ModelOut, StatsOut } from '@/shared/api'

export interface IProviderUsage {
	provider: string
	calls: number
	cost: number
	tokensIn: number
	tokensOut: number
	models: string[]
}

/**
 * Сводит статистику моделей по провайдерам: в счёт идёт вся семья моделей сразу,
 * а не каждая по отдельности.
 */
export function usageByProvider(models: Record<string, ModelOut>, stats: StatsOut): IProviderUsage[] {
	const map = new Map<string, IProviderUsage>()

	for (const [id, info] of Object.entries(models)) {
		const usage = map.get(info.provider) ?? {
			provider: info.provider,
			calls: 0,
			cost: 0,
			tokensIn: 0,
			tokensOut: 0,
			models: []
		}
		usage.models.push(id)

		const stat = stats.models[id]
		if (stat) {
			usage.calls += stat.calls
			usage.cost += stat.cost
			usage.tokensIn += stat.tokens_in
			usage.tokensOut += stat.tokens_out
		}
		map.set(info.provider, usage)
	}

	return [...map.values()]
}

/** На сколько дней хватит остатка при нынешнем темпе; null, если считать не из чего. */
export function daysLeft(balance: number | null, stats: StatsOut): { perDay: number; days: number } | null {
	if (balance === null || stats.daily.length === 0) return null
	const perDay = stats.total.cost / stats.daily.length
	return perDay > 0 ? { perDay, days: Math.floor(balance / perDay) } : null
}
