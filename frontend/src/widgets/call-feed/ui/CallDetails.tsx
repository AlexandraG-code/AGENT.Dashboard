'use client'

import { useEffect, useState } from 'react'
import { fleetApi, type CallOut } from '@/shared/api'
import { duration, money, tokens } from '@/shared/lib/format'

export function CallDetails({ callId, onClose }: { callId: string | null; onClose: () => void }) {
	const [data, setData] = useState<CallOut | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!callId) return
		let cancelled = false

		const load = async () => {
			setLoading(true)
			setError(null)
			try {
				const result = await fleetApi.call(callId)
				if (!cancelled) setData(result)
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки вызова')
			} finally {
				if (!cancelled) setLoading(false)
			}
		}

		void load()
		return () => {
			cancelled = true
		}
	}, [callId])

	useEffect(() => {
		if (!callId) return
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [callId, onClose])

	if (!callId) return null

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Подробности вызова"
			className="fixed top-0 right-0 h-full w-[min(680px,100vw)] overflow-y-auto bg-slate-900/80 p-6 ring-1 ring-white/10 backdrop-blur-xl"
		>
			<button
				type="button"
				onClick={onClose}
				aria-label="Закрыть"
				className="absolute top-4 right-4 rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
					<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
				</svg>
			</button>

			{loading && <p className="text-slate-400">Загрузка...</p>}
			{error && <p className="text-red-400">{error}</p>}
			{data && (
				<div className="space-y-6">
					<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
						<div>
							<span className="text-slate-400">Роль: </span>
							<span className="font-medium text-slate-200">{data.role ?? '—'}</span>
						</div>
						<div>
							<span className="text-slate-400">Модель: </span>
							<span className="font-medium text-slate-200">{data.model ?? '—'}</span>
						</div>
						<div>
							<span className="text-slate-400">Проект: </span>
							<span className="font-medium text-slate-200">{data.project ?? '—'}</span>
						</div>
						<div>
							<span className="text-slate-400">Стоимость: </span>
							<span className="font-mono text-slate-200 tabular-nums">{money(data.cost ?? 0)}</span>
						</div>
						<div>
							<span className="text-slate-400">Длительность: </span>
							<span className="font-mono text-slate-200 tabular-nums">{duration(data.seconds ?? 0)}</span>
						</div>
						<div>
							<span className="text-slate-400">Токены: </span>
							<span className="font-mono text-slate-200 tabular-nums">
								{tokens(data.tokens_in ?? 0)}→{tokens(data.tokens_out ?? 0)}
							</span>
						</div>
						{data.tokens_cached ? (
							<div>
								<span className="text-slate-400">Из кэша: </span>
								<span className="font-mono text-slate-200 tabular-nums">
									{tokens(data.tokens_cached)}
								</span>
							</div>
						) : null}
						{data.tokens_reasoning ? (
							<div>
								<span className="text-slate-400">Размышления: </span>
								<span className="font-mono text-slate-200 tabular-nums">
									{tokens(data.tokens_reasoning)}
								</span>
							</div>
						) : null}
					</div>

					{data.messages && data.messages.length > 0 && (
						<div className="space-y-4">
							<h3 className="text-sm font-semibold text-slate-300">Сообщения промпта</h3>
							{data.messages.map((msg, idx) => (
								<div key={idx} className="rounded-lg bg-slate-800/50 p-3">
									<div className="mb-1 text-xs font-medium tracking-wider text-slate-500 uppercase">
										{msg.role ?? '—'}
									</div>
									{typeof msg.content === 'string' ? (
										<pre className="max-h-64 overflow-y-auto text-sm break-words whitespace-pre-wrap text-slate-300">
											{msg.content}
										</pre>
									) : Array.isArray(msg.content) ? (
										<div className="space-y-2">
											{msg.content.map((part, partIdx) => (
												<pre
													key={partIdx}
													className="max-h-64 overflow-y-auto text-sm break-words whitespace-pre-wrap text-slate-300"
												>
													{JSON.stringify(part, null, 2)}
												</pre>
											))}
										</div>
									) : (
										<p className="text-sm text-slate-400">—</p>
									)}
								</div>
							))}
						</div>
					)}

					{data.reasoning ? (
						<div>
							<h3 className="text-sm font-semibold text-slate-300">Размышления</h3>
							<pre className="mt-2 max-h-96 overflow-y-auto rounded-lg bg-slate-800/50 p-3 text-sm break-words whitespace-pre-wrap text-slate-300">
								{data.reasoning}
							</pre>
						</div>
					) : null}

					{data.text ? (
						<div>
							<h3 className="text-sm font-semibold text-slate-300">Ответ</h3>
							<pre className="mt-2 max-h-96 overflow-y-auto rounded-lg bg-slate-800/50 p-3 text-sm break-words whitespace-pre-wrap text-slate-300">
								{data.text}
							</pre>
						</div>
					) : null}
				</div>
			)}
		</div>
	)
}
