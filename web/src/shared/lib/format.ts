// файл: src/shared/lib/format.ts

const NBSP = '\u00A0'

// 4 знака после запятой; до цента (0 < v < 0.01) показываем 5 знаков
export function money(v: number): string {
	if (v === 0) return '$0'
	const decimals = v > 0 && v < 0.01 ? 5 : 4
	return `$${v.toFixed(decimals)}`
}

export function tokens(v: number): string {
	if (Math.abs(v) >= 1_000_000) {
		return `${(v / 1_000_000).toFixed(1)}M`
	}
	return Math.round(v)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

export function duration(sec: number): string {
	if (sec < 60) return `${sec.toFixed(1)}с`
	const m = Math.floor(sec / 60)
	const s = Math.round(sec % 60)
	return `${m}м${NBSP}${s}с`
}

export function dateTime(ts: number): string {
	return new Date(ts * 1000).toLocaleString('ru-RU')
}

export function timeOnly(ts: number): string {
	return new Date(ts * 1000).toLocaleTimeString('ru-RU')
}

export function percent(part: number, whole: number): string {
	if (whole === 0) return '0%'
	return `${Math.round((part / whole) * 100)}%`
}
