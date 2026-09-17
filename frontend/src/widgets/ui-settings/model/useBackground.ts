'use client'

import { BACKGROUND_PRESETS, THEME_BACKGROUND, type IBackground } from '@/shared/config'
import { useUiSettings } from '@/shared/model'

interface IBackgroundControl {
	/** Имя пресета либо `custom`, если цвета правили пикером. */
	preset: string
	colors: IBackground
	setPreset: (name: string) => void
	setStop: (stop: keyof IBackground, value: string) => void
	resetBackground: () => void
}

/**
 * Фон страницы для панели «Вид»: какой пресет выбран, какие сейчас цвета
 * и как их менять.
 *
 * Имя пресета не хранится отдельным полем: оно вычисляется сравнением цветов
 * с заготовками. Иначе появляется вторая правда — сохранённое имя пресета и не
 * совпадающие с ним цвета.
 */
export function useBackground(): IBackgroundControl {
	const { background, surface, set } = useUiSettings()
	const fallback = BACKGROUND_PRESETS[surface === 'light' ? THEME_BACKGROUND.light : THEME_BACKGROUND.dark]
	const colors = background ?? fallback

	const match = Object.entries(BACKGROUND_PRESETS).find(([, preset]) =>
		(Object.keys(preset) as (keyof IBackground)[]).every(
			(stop) => preset[stop].toLowerCase() === colors[stop].toLowerCase()
		)
	)

	return {
		preset: match ? match[0] : 'custom',
		colors,
		setPreset: (name) => {
			const preset = BACKGROUND_PRESETS[name]
			if (preset) set({ background: preset })
		},
		setStop: (stop, value) => set({ background: { ...colors, [stop]: value } }),
		resetBackground: () => set({ background: null })
	}
}
