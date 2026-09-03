'use client'

import { useEffect, useState } from 'react'

import { fleetApi, type StatsOut } from '@/shared/api'

interface StatsResult {
	stats: StatsOut | null
	error: string
}

/**
 * Статистика за окно `days` по выбранному пространству ('' — по всем сразу).
 * Живёт в shared, потому что её показывают сразу несколько виджетов обзора,
 * а считать её дважды незачем: один запрос отдаёт все разрезы.
 */
export function useStats(project: string, days = 30): StatsResult {
	const [stats, setStats] = useState<StatsOut | null>(null)
	const [error, setError] = useState('')

	useEffect(() => {
		let alive = true
		const load = () => {
			fleetApi
				.stats(days, project)
				.then((data) => {
					if (!alive) return
					setStats(data)
					setError('')
				})
				.catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
		}
		load()
		// Реже ленты: полный пересчёт журнала дороже, а цифры за минуту не убегают.
		const timer = setInterval(load, 15000)
		return () => {
			alive = false
			clearInterval(timer)
		}
	}, [project, days])

	return { stats, error }
}
