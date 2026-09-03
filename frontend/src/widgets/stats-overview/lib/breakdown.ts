import type { ModelStat, ProjectStat, Slot } from '@/shared/api'

/** Сумма токенов входа и выхода — ею меряется длина полос в разрезах. */
export function totalTokens(slot: Slot): number {
	return slot.tokens_in + slot.tokens_out
}

/** Наибольшее значение в наборе: относительно него считаются длины полос. */
export function peakOf<T>(items: T[], value: (item: T) => number): number {
	return Math.max(...items.map(value), 1)
}

/** Строки разреза по моделям, отсортированные по расходу токенов. */
export function modelRows(models: Record<string, ModelStat>): Array<[string, ModelStat]> {
	return Object.entries(models).sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))
}

/** Строки разреза по проектам вместе с общей стоимостью — для доли в процентах. */
export function projectRows(projects: Record<string, ProjectStat>): {
	rows: Array<[string, ProjectStat]>
	totalCost: number
} {
	const rows = Object.entries(projects).sort((a, b) => b[1].cost - a[1].cost)
	return { rows, totalCost: rows.reduce((sum, [, stat]) => sum + stat.cost, 0) }
}
