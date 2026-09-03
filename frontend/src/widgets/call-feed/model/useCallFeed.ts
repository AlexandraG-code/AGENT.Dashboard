'use client'

import { useEffect, useRef, useState } from 'react'

import { fleetApi, type EventOut } from '@/shared/api'

const LIMIT = 300
const INTERVAL = 2000

/**
 * Живая лента событий: опрашивает журнал и накапливает события, новые сверху.
 * Ошибку запроса не роняет наружу — лента не должна валить страницу, — но
 * последнюю показывает, чтобы молчание не путали с отсутствием работы.
 */
export function useCallFeed(): { events: EventOut[]; error: string } {
	const [events, setEvents] = useState<EventOut[]>([])
	const [error, setError] = useState('')
	const since = useRef(0)

	useEffect(() => {
		let alive = true
		// Флаг «запрос в полёте»: медленный ответ не должен наложиться на следующий тик
		// и обработать одно и то же событие дважды.
		let inFlight = false

		const poll = async () => {
			if (inFlight) return
			inFlight = true
			try {
				const { events: fresh } = await fleetApi.events(since.current, 120)
				if (!alive) return
				setError('')
				if (fresh.length > 0) {
					const sorted = [...fresh].sort((a, b) => b.ts - a.ts)
					since.current = sorted[0].ts + 0.000001
					setEvents((prev) => [...sorted, ...prev].slice(0, LIMIT))
				}
			} catch (e) {
				if (alive) setError(e instanceof Error ? e.message : String(e))
			} finally {
				inFlight = false
			}
		}

		void poll()
		const timer = setInterval(() => void poll(), INTERVAL)
		return () => {
			alive = false
			clearInterval(timer)
		}
	}, [])

	return { events, error }
}
