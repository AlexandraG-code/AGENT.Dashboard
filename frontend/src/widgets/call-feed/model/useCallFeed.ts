'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { fleetApi, type EventOut } from '@/shared/api'

/** Глубина показа журнала. Всё — с самого первого события в файле. */
export type Period = 'hour' | 'day' | 'week' | 'month' | 'all'

const SECONDS: Record<Period, number> = {
	hour: 3600,
	day: 86400,
	week: 7 * 86400,
	month: 30 * 86400,
	all: 0
}

// Сколько строк тянем за раз. Журнал — jsonl на диске, чтение целиком дешёвое,
// но держать в памяти браузера весь год смысла нет.
const HISTORY = 1500
const TAIL = 120
const INTERVAL = 2000

interface ICallFeed {
	events: EventOut[]
	total: number
	period: Period
	setPeriod: (value: Period) => void
	query: string
	setQuery: (value: string) => void
	loading: boolean
	error: string
}

/**
 * Журнал команды: история за выбранный период плюс живой хвост.
 *
 * Раньше лента показывала только то, что случилось после открытия страницы, и
 * выглядела пустой. Теперь при выборе периода история читается целиком, а опрос
 * добавляет к ней только новые события.
 */
export function useCallFeed(): ICallFeed {
	const [events, setEvents] = useState<EventOut[]>([])
	const [period, setPeriodState] = useState<Period>('day')
	const [query, setQuery] = useState('')
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const since = useRef(0)

	useEffect(() => {
		let alive = true
		// Флаг «запрос в полёте»: медленный ответ не должен наложиться на следующий тик
		// и обработать одно и то же событие дважды.
		let inFlight = false
		const from = period === 'all' ? 0 : Date.now() / 1000 - SECONDS[period]
		since.current = from

		const poll = async (first: boolean) => {
			if (inFlight) return
			inFlight = true
			try {
				const { events: fresh } = await fleetApi.events(since.current, first ? HISTORY : TAIL)
				if (!alive) return
				setError('')
				const sorted = [...fresh].sort((a, b) => b.ts - a.ts)
				if (sorted.length > 0) {
					since.current = sorted[0].ts + 0.000001
				}
				if (first) setEvents(sorted)
				else if (sorted.length > 0) setEvents((prev) => [...sorted, ...prev].slice(0, HISTORY))
			} catch (e) {
				if (alive) setError(e instanceof Error ? e.message : String(e))
			} finally {
				inFlight = false
				if (alive && first) setLoading(false)
			}
		}

		void poll(true)
		const timer = setInterval(() => void poll(false), INTERVAL)
		return () => {
			alive = false
			clearInterval(timer)
		}
	}, [period])

	const needle = query.trim().toLowerCase()
	const visible = useMemo(() => {
		if (needle === '') return events
		// Ищем по всем текстовым полям строки: роль, модель, задачу, имя, ошибку —
		// человек не обязан помнить, в какой колонке он видел слово.
		return events.filter((event) =>
			[event.role, event.model, event.project, event.task, event.name, event.topic, event.query, event.error, event.event]
				.filter((value): value is string => typeof value === 'string')
				.some((value) => value.toLowerCase().includes(needle))
		)
	}, [events, needle])

	return {
		events: visible,
		total: events.length,
		period,
		setPeriod: (value) => {
			setLoading(true)
			setPeriodState(value)
		},
		query,
		setQuery,
		loading,
		error
	}
}
