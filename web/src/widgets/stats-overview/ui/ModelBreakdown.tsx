'use client'

import { SeriesDot } from '@/shared/ui/SeriesDot'
import type { ModelStat } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'

interface ModelBreakdownProps {
	models: Record<string, ModelStat>
	colors: Record<string, string>
}

/**
 * Сколько сожрала каждая модель по всем проектам сразу.
 * Горизонтальные бары с прямыми подписями: имя модели стоит рядом со своим
 * баром, поэтому легенда не нужна, а идентичность не держится на одном цвете.
 */
export function ModelBreakdown({ models, colors }: ModelBreakdownProps) {
	const rows = Object.entries(models)
	if (rows.length === 0) {
		return <p className="text-sm text-slate-400">Вызовов ещё не было.</p>
	}
	const peak = Math.max(...rows.map(([, s]) => s.tokens_in + s.tokens_out), 1)

	return (
		<ul className="flex flex-col gap-3">
			{rows.map(([name, stat]) => {
				const total = stat.tokens_in + stat.tokens_out
				return (
					<li key={name}>
						<div className="flex items-baseline justify-between gap-3 text-sm">
							<span className="flex min-w-0 items-center gap-2">
								<SeriesDot color={colors[name] ?? '#64748b'} />
								<span className="truncate text-slate-100">{name}</span>
							</span>
							<span className="font-mono text-xs text-slate-400 tabular-nums">
								{stat.calls} выз. · {money(stat.cost)}
							</span>
						</div>
						{/* Вход и выход — один бар из двух долей: они складываются в общий расход
						    токенов, поэтому доли честнее двух отдельных шкал. */}
						<div
							className="mt-1.5 flex h-2 gap-0.5"
							style={{ width: `${Math.max(4, (total / peak) * 100)}%` }}
						>
							<div
								className="rounded-l-sm"
								style={{ backgroundColor: colors[name] ?? '#64748b', flexGrow: stat.tokens_in || 1 }}
								title={`вход ${tokens(stat.tokens_in)} токенов`}
							/>
							<div
								className="rounded-r-sm opacity-45"
								style={{ backgroundColor: colors[name] ?? '#64748b', flexGrow: stat.tokens_out || 1 }}
								title={`выход ${tokens(stat.tokens_out)} токенов`}
							/>
						</div>
						<div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
							вход {tokens(stat.tokens_in)} · выход {tokens(stat.tokens_out)}
							{stat.tokens_cached > 0 && <> · из кэша {tokens(stat.tokens_cached)}</>}
						</div>
					</li>
				)
			})}
		</ul>
	)
}
