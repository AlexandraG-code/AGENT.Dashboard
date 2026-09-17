/**
 * Готовые фоны страницы: базовый цвет и три цветных пятна градиента.
 *
 * Значения проверены на тёмной и светлой поверхностях: пятна дают подсветку
 * стеклу, но не поднимают яркость под текстом настолько, чтобы уронить контраст.
 * Свой фон человек собирает пикером — тогда пресет становится `custom`.
 */
export interface IBackground {
	base: string
	glow1: string
	glow2: string
	glow3: string
}

export const BACKGROUND_PRESETS: Record<string, IBackground> = {
	nebula: { base: '#070b18', glow1: '#7c3aed', glow2: '#0891b2', glow3: '#2563eb' },
	graphite: { base: '#0b0e14', glow1: '#334155', glow2: '#475569', glow3: '#1e293b' },
	forest: { base: '#06120f', glow1: '#0f766e', glow2: '#22c55e', glow3: '#0e7490' },
	ember: { base: '#120a0c', glow1: '#b91c1c', glow2: '#d97706', glow3: '#7c2d12' },
	daylight: { base: '#eef1f8', glow1: '#a78bfa', glow2: '#67e8f9', glow3: '#93c5fd' }
}

// Что показывает пикер, пока свой фон не выбран: ровно то, что задано токенами
// темы. Держать эти значения синонимом _tokens.scss приходится потому, что
// прочитать переменную с сервера нечем, а панель обязана открываться с верными цветами.
export const THEME_BACKGROUND = { dark: 'nebula', light: 'daylight' } as const
