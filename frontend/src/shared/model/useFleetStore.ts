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
 *
 * Выбранное пространство переживает перезагрузку: оно определяет, куда уходит
 * работа, и терять его при F5 значит каждый раз выбирать заново (а то и не
 * заметить, что выбрано не то).
 */
const KEY = 'fleet-project'

const remembered = (): string => {
	try {
		return localStorage.getItem(KEY) ?? ''
	} catch {
		return ''
	}
}

const remember = (project: string): void => {
	try {
		localStorage.setItem(KEY, project)
	} catch {
		// приватный режим браузера — выбор просто не переживёт перезагрузку
	}
}

export const useFleetStore = create<FleetState & FleetActions>()((set, get) => ({
	state: null,
	project: '',
	loading: false,
	error: '',

	load: async () => {
		set({ loading: true, error: '' })
		try {
			// Пространство из localStorage читается здесь, а не в начальном состоянии:
			// стартовое значение стора уходит в серверную отрисовку, где localStorage нет.
			const wanted = get().project || remembered()
			let state = await fleetApi.state(wanted)
			const exists = state.projects.some((p) => p.id === wanted)
			const project = exists ? wanted : (state.projects[0]?.id ?? '')
			// Состав приходит по выбранному пространству, а команды у проектов
			// разные: если выбор оказался другим, спрашиваем заново — иначе на
			// экране окажется команда не того проекта.
			if (project !== wanted) state = await fleetApi.state(project)
			remember(project)
			set({ state, loading: false, project })
		} catch (error) {
			set({ loading: false, error: error instanceof Error ? error.message : String(error) })
		}
	},

	setProject: (project) => {
		remember(project)
		set({ project })
		// Смена пространства меняет и команду, поэтому состояние перечитывается:
		// роли в сторе принадлежат конкретному проекту, а не приложению.
		void get().load()
	}
}))
