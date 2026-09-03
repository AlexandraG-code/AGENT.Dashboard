'use client'

import { create } from 'zustand'

import { fleetApi, type StateOut } from '@/shared/api'

interface FleetState {
	state: StateOut | null
	project: string
	loading: boolean
	error: string
}

interface FleetActions {
	load: () => Promise<void>
	setProject: (project: string) => void
}

/**
 * Общее состояние оболочки: состав команды, список пространств и выбранное пространство.
 * Живые данные (лента, статистика) сюда не кладём — они опрашиваются точечно
 * теми виджетами, которым нужны, и не дёргают перерисовку всего дашборда.
 */
export const useFleetStore = create<FleetState & FleetActions>()((set, get) => ({
	state: null,
	project: '',
	loading: false,
	error: '',

	load: async () => {
		set({ loading: true, error: '' })
		try {
			const state = await fleetApi.state()
			const current = get().project
			const exists = state.projects.some((p) => p.id === current)
			set({
				state,
				loading: false,
				project: exists ? current : (state.projects[0]?.id ?? '')
			})
		} catch (error) {
			set({ loading: false, error: error instanceof Error ? error.message : String(error) })
		}
	},

	setProject: (project) => set({ project })
}))
