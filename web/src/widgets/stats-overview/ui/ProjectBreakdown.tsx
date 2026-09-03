'use client'

import { SeriesDot } from '@/shared/ui/SeriesDot'
import type { ProjectStat } from '@/shared/api'
import { money, percent, tokens } from '@/shared/lib/format'

interface ProjectBreakdownProps {
	projects: Record<string, ProjectStat>
	colors: Record<string, string>
	titles: Record<string, string>
}

/**
 * Расход по проектам, внутри проекта — доли моделей.
 * Сегменты разделены зазором в 2px по фону: без него соседние доли слипаются
 * в одно пятно. Цвет модели тот же, что и в разрезе по моделям.
 */
export function ProjectBreakdown({ projects, colors, titles }: ProjectBreakdownProps) {
	const rows = Object.entries(projects)
	if (rows.length === 0) {
		return <p className="text-sm text-slate-400">Вызовов ещё не было.</p>
	}
	const peak = Math.max(...rows.map(([, s]) => s.cost), 0.000001)
	const totalCost = rows.reduce((sum, [, s]) => sum + s.cost, 0)

	return (
		<ul className="flex flex-col gap-4">
			{rows.map(([id, stat]) => (
				<li key={id}>
					<div className="flex items-baseline justify-between gap-3 text-sm">
						<span className="truncate text-slate-100">{titles[id] ?? id}</span>
						<span className="font-mono text-xs text-slate-400 tabular-nums">
							{money(stat.cost)} · {percent(stat.cost, totalCost)} · {stat.calls} выз.
						</span>
					</div>
					<div
						className="mt-1.5 flex h-2.5 gap-0.5"
						style={{ width: `${Math.max(4, (stat.cost / peak) * 100)}%` }}
					>
						{Object.entries(stat.by_model).map(([model, slot]) => (
							<div
								key={model}
								className="first:rounded-l-sm last:rounded-r-sm"
								style={{
									backgroundColor: colors[model] ?? '#64748b',
									flexGrow: slot.tokens_in + slot.tokens_out || 1
								}}
								title={`${model}: ${money(slot.cost)}, ${tokens(slot.tokens_in)}→${tokens(slot.tokens_out)} токенов`}
							/>
						))}
					</div>
					<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-400 tabular-nums">
						{Object.entries(stat.by_model).map(([model, slot]) => (
							<span key={model} className="flex items-center gap-1.5">
								<SeriesDot color={colors[model] ?? '#64748b'} className="h-2 w-2" />
								{model}: {tokens(slot.tokens_in)}→{tokens(slot.tokens_out)}
							</span>
						))}
					</div>
				</li>
			))}
		</ul>
	)
}
