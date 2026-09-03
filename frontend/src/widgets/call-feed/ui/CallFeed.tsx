'use client'

import { useEffect, useRef, useState } from 'react'
import { fleetApi, type EventOut } from '@/shared/api'
import { money, tokens, timeOnly } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'

function EventRow({ event, onSelect }: { event: EventOut; onSelect: (id: string) => void }) {
	const isCall = event.event === 'call'
	const isError = event.event === 'error'
	const isClickable = isCall && event.id != null

	const handleClick = () => {
		if (isCall && event.id != null) onSelect(event.id)
	}

	const content = (
		<div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-3 px-3 py-2 text-sm">
			<span className="font-mono text-slate-400 tabular-nums">{timeOnly(event.ts)}</span>
			{isError ? (
				<span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">ошибка</span>
			) : isCall ? (
				<span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
					{event.role ?? '—'}
				</span>
			) : (
				<span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
					{event.event}
				</span>
			)}
			<div className="truncate text-slate-400">
				{isError ? (
					<span className="text-red-400">{event.error ?? 'Ошибка без описания'}</span>
				) : isCall ? (
					<span>{event.model ?? '—'}</span>
				) : (
					<span>{event.name ?? event.topic ?? event.query ?? event.role ?? '—'}</span>
				)}
			</div>
			<div className="truncate text-slate-400">{isCall ? (event.task ?? '—') : ''}</div>
			<div className="font-mono text-slate-400 tabular-nums">
				{isCall ? `${tokens(event.tokens_in ?? 0)}→${tokens(event.tokens_out ?? 0)}` : ''}
			</div>
			<div
				className={cn(
					'font-mono tabular-nums',
					isCall && (event.cost ?? 0) === 0 ? 'text-green-400' : 'text-slate-400'
				)}
			>
				{isCall ? ((event.cost ?? 0) === 0 ? '0' : money(event.cost ?? 0)) : ''}
			</div>
		</div>
	)

	if (isClickable) {
		return (
			<button
				type="button"
				onClick={handleClick}
				className="w-full cursor-pointer rounded-lg text-left transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none"
			>
				{content}
			</button>
		)
	}

	return <div className="rounded-lg">{content}</div>
}

export function CallFeed({ onSelect }: { onSelect: (callId: string) => void }) {
	const [events, setEvents] = useState<EventOut[]>([])
	const sinceRef = useRef(0)
	const [lastError, setLastError] = useState<string | null>(null)

	useEffect(() => {
		// Флаг «запрос в полёте»: медленный ответ не должен наложиться на следующий тик
		// и обработать один и тот же ts дважды.
		let inFlight = false
		const fetchEvents = async () => {
			if (inFlight) return
			inFlight = true
			try {
				const { events: fresh } = await fleetApi.events(sinceRef.current, 120)
				setLastError(null)
				if (fresh.length > 0) {
					const sorted = [...fresh].sort((a, b) => b.ts - a.ts)
					const maxTs = sorted[0]?.ts ?? sinceRef.current
					sinceRef.current = maxTs + 0.000001
					setEvents((prev) => [...sorted, ...prev].slice(0, 300))
				}
			} catch (err) {
				setLastError(err instanceof Error ? err.message : 'Ошибка получения событий')
			} finally {
				inFlight = false
			}
		}

		void fetchEvents()
		const interval = setInterval(() => {
			void fetchEvents()
		}, 2000)
		return () => clearInterval(interval)
	}, [])

	return (
		<div className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-white/10 backdrop-blur-xl">
			{lastError && <div className="mb-2 text-sm text-slate-400">{lastError}</div>}
			<div className="space-y-1">
				{events.map((event, index) => (
					<EventRow key={`${event.ts}-${index}`} event={event} onSelect={onSelect} />
				))}
			</div>
		</div>
	)
}
