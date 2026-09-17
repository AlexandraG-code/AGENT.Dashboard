'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.

import { create } from 'zustand'

const KEY_PREFIX = 'fleet-chat-draft:'

interface IChatDraftStore {
	drafts: Record<string, string>
	restore: (project: string) => void
	set: (project: string, value: string) => void
	clear: (project: string) => void
}

const key = (project: string) => KEY_PREFIX + project

/**
 * Черновик сообщения чата: набранный, но не отправленный текст.
 *
 * Живёт в браузере, а не на сервере: это личная заготовка одного человека в
 * одном браузере, команде она не нужна. Стор, а не useState с чтением в
 * эффекте, потому что синхронный setState в теле эффекта в проекте запрещён,
 * а начальное значение уходит в серверную отрисовку, где localStorage нет.
 */
export const useChatDraft = create<IChatDraftStore>()((set) => ({
	drafts: {},

	restore: (project) => {
		let value = ''
		try {
			value = localStorage.getItem(key(project)) ?? ''
		} catch {
			// приватный режим браузера — черновик просто не переживёт перезагрузку
		}
		set((state) => ({ drafts: { ...state.drafts, [project]: value } }))
	},

	set: (project, value) => {
		try {
			if (value === '') localStorage.removeItem(key(project))
			else localStorage.setItem(key(project), value)
		} catch {
			// приватный режим браузера — черновик просто не переживёт перезагрузку
		}
		set((state) => ({ drafts: { ...state.drafts, [project]: value } }))
	},

	clear: (project) => {
		try {
			localStorage.removeItem(key(project))
		} catch {
			// приватный режим браузера — черновик просто не переживёт перезагрузку
		}
		set((state) => ({ drafts: { ...state.drafts, [project]: '' } }))
	}
}))
