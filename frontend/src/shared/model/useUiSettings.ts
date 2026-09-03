'use client'

import { create } from 'zustand'

export type Weight = 'normal' | 'medium' | 'bold'
export type Contrast = 'normal' | 'high'
export type Surface = 'glass' | 'solid' | 'light'
export type FontFamily = 'fira' | 'system' | 'verdana'

export interface UiSettings {
	/** Базовый кегль в пикселях: от него считаются все размеры (Tailwind меряет в rem). */
	fontSize: number
	weight: Weight
	contrast: Contrast
	surface: Surface
	font: FontFamily
}

const DEFAULTS: UiSettings = {
	fontSize: 17,
	weight: 'medium',
	contrast: 'high',
	surface: 'glass',
	font: 'fira'
}

const KEY = 'fleet-ui'

interface UiStore extends UiSettings {
	set: (patch: Partial<UiSettings>) => void
	reset: () => void
	restore: () => void
}

/**
 * Настройки читаемости. Живут в localStorage и применяются атрибутами на <html>,
 * поэтому переживают перезагрузку и не зависят от того, какой виджет отрисовался.
 */
export function applySettings(settings: UiSettings): void {
	const root = document.documentElement
	root.style.fontSize = `${settings.fontSize}px`
	root.dataset.weight = settings.weight
	root.dataset.contrast = settings.contrast
	root.dataset.surface = settings.surface
	root.dataset.font = settings.font
}

const read = (): UiSettings => {
	try {
		const raw = localStorage.getItem(KEY)
		return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UiSettings>) } : DEFAULTS
	} catch {
		return DEFAULTS
	}
}

export const useUiSettings = create<UiStore>()((set, get) => ({
	...DEFAULTS,

	set: (patch) => {
		const next = { ...get(), ...patch }
		set(patch)
		try {
			localStorage.setItem(
				KEY,
				JSON.stringify({
					fontSize: next.fontSize,
					weight: next.weight,
					contrast: next.contrast,
					surface: next.surface,
					font: next.font
				})
			)
		} catch {
			// приватный режим браузера — настройки просто не переживут перезагрузку
		}
		applySettings(next)
	},

	reset: () => {
		set(DEFAULTS)
		try {
			localStorage.removeItem(KEY)
		} catch {
			// нечего чистить
		}
		applySettings(DEFAULTS)
	},

	restore: () => {
		const stored = read()
		set(stored)
		applySettings(stored)
	}
}))
