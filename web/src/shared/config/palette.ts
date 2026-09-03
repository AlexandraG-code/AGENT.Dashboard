/**
 * Цвета серий для разрезов по моделям.
 *
 * Порядок фиксирован и проверен валидатором палитр на тёмной поверхности #0f172a:
 * полоса светлоты OKLCH 0.48–0.67, контраст ≥3:1, различимость при дальтонизме
 * ΔE ≥ 10 для соседних пар. Менять порядок нельзя — распадётся именно проверенное
 * соседство. Цвет закреплён за моделью, а не за её местом в рейтинге: иначе
 * фильтр по проекту перекрашивал бы выживших.
 */
export const SERIES_COLORS = ['#0284c7', '#059669', '#7c3aed', '#e11d48', '#0d9488', '#d97706'] as const

/** Всё, что не влезло в шесть слотов, сводится в нейтральный «прочие». */
export const OTHER_COLOR = '#64748b'

export function buildModelColors(models: string[]): Record<string, string> {
	const stable = [...models].sort()
	return Object.fromEntries(stable.map((model, index) => [model, SERIES_COLORS[index] ?? OTHER_COLOR]))
}
