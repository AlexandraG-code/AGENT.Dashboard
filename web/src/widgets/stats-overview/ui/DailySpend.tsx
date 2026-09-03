'use client'

import type { DayStat } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'

interface DailySpendProps {
	days: DayStat[]
}

/**
 * Расход по дням — одна серия, поэтому легенда не нужна: заголовок её называет.
 * Столбик тонкий, скруглён с торца и стоит на базовой линии; подписана только
 * вершина, а не каждый день — иначе график превращается в таблицу.
 */
export function DailySpend({ days }: DailySpendProps) {
	if (days.length === 0) {
		return <p className="text-sm text-slate-400">Вызовов ещё не было.</p>
	}

	const peak = Math.max(...days.map((d) => d.cost), 0.000001)
	const peakDate = days.find((d) => d.cost === Math.max(...days.map((x) => x.cost)))?.date

	return (
		<div>
			<div className="flex h-40 items-end gap-1.5" role="img" aria-label="Расход по дням">
				{days.map((day) => (
					<div key={day.date} className="group relative flex h-full flex-1 flex-col justify-end">
						<div
							className="rounded-t bg-sky-600 transition-colors group-hover:bg-sky-500"
							style={{ height: `${Math.max(2, (day.cost / peak) * 100)}%` }}
						/>
						<div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-slate-900/95 px-3 py-2 text-xs whitespace-nowrap text-slate-100 ring-1 ring-white/15 group-hover:block">
							<div className="font-medium">{day.date}</div>
							<div className="text-slate-300">
								{money(day.cost)} · {day.calls} выз. · {tokens(day.tokens_in)}→{tokens(day.tokens_out)}{' '}
								ток.
							</div>
						</div>
					</div>
				))}
			</div>
			<div className="mt-2 flex justify-between font-mono text-[11px] text-slate-400">
				<span>{days[0]?.date}</span>
				<span>
					пик {money(peak)} · {peakDate}
				</span>
				<span>{days[days.length - 1]?.date}</span>
			</div>
		</div>
	)
}
