'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.

import { create } from 'zustand'

const KEY = 'fleet-tab'

interface ITabMemoryStore {
	tab: string
	restore: (fallback: string) => void
	set: (key: string) => void
}

/**
 * Память открытой вкладки: перезагрузка не должна выбрасывать со страницы,
 * на которой человек работал.
 *
 * Стор, а не useState с чтением в эффекте: синхронный setState в теле эффекта
 * в проекте запрещён, а начальное значение уходит в серверную отрисовку, где
 * ни localStorage, ни адреса страницы нет.
 */
export const useTabMemory = create<ITabMemoryStore>()((set) => ({
	tab: '',

	restore: (fallback) => {
		let value = fallback
		try {
			const hash = window.location.hash.slice(1)
			value = hash || localStorage.getItem(KEY) || fallback
		} catch {
			// приватный режим браузера — вкладка просто не переживёт перезагрузку
		}
		set({ tab: value })
	},

	set: (key) => {
		try {
			localStorage.setItem(KEY, key)
			// replaceState, а не pushState: вкладки не должны копиться в истории браузера.
			window.history.replaceState(null, '', `#${key}`)
		} catch {
			// приватный режим браузера
		}
		set({ tab: key })
	}
}))
