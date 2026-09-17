'use client'

import { useCallback, useEffect, useState } from 'react'

import { fleetApi, type SetupOut, type TeamOut } from '@/shared/api'

interface ITeamSetup {
	setup: SetupOut | null
	teams: TeamOut[]
	assign: (key: string, role: string) => Promise<void>
}

/**
 * Устройство команды: какие права приложение может выдать роли и кто занимает
 * служебные места.
 *
 * Список приходит с бэкенда, а не живёт во фронте: набор прав и служебных мест —
 * часть договора приложения с человеком, и держать его в двух местах значит
 * однажды их развести.
 *
 * @param project — пространство: назначения свои у команды каждого проекта
 */
export function useTeamSetup(project: string): ITeamSetup {
	const [setup, setSetup] = useState<SetupOut | null>(null)

	const load = useCallback(() => {
		fleetApi
			.setup(project)
			.then(setSetup)
			.catch(() => undefined)
	}, [project])

	useEffect(() => {
		load()
	}, [load])

	return {
		setup,
		teams: setup?.teams ?? [],
		assign: async (key, role) => {
			await fleetApi.saveSetup(project, { [key]: role })
			load()
		}
	}
}
