import type { ProjectStat } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'

interface BreakdownTableProps {
	projects: Record<string, ProjectStat>
	titles: Record<string, string>
}

/**
 * Тот же срез таблицей — вид, в котором данные читаются без цвета вообще
 * (скринридером, на печати, при дальтонизме) и который не врёт округлением.
 */
export function BreakdownTable({ projects, titles }: BreakdownTableProps) {
	const rows = Object.entries(projects).flatMap(([id, stat]) =>
		Object.entries(stat.by_model).map(([model, slot]) => ({ id, model, slot }))
	)

	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[560px] border-collapse text-sm">
				<caption className="sr-only">Расход по проектам и моделям</caption>
				<thead>
					<tr className="border-b border-white/10 text-left text-xs tracking-wide text-slate-400 uppercase">
						<th className="py-2 pr-3 font-medium">Проект</th>
						<th className="py-2 pr-3 font-medium">Модель</th>
						<th className="py-2 pr-3 text-right font-medium">Вызовов</th>
						<th className="py-2 pr-3 text-right font-medium">Вход</th>
						<th className="py-2 pr-3 text-right font-medium">Выход</th>
						<th className="py-2 text-right font-medium">Стоимость</th>
					</tr>
				</thead>
				<tbody className="font-mono text-xs text-slate-300 tabular-nums">
					{rows.map(({ id, model, slot }) => (
						<tr key={`${id}:${model}`} className="border-b border-white/5 last:border-0">
							<td className="py-1.5 pr-3 font-sans text-slate-100">
								{titles[id] ?? (id === '—' ? 'без пространства' : id)}
							</td>
							<td className="py-1.5 pr-3">{model}</td>
							<td className="py-1.5 pr-3 text-right">{slot.calls}</td>
							<td className="py-1.5 pr-3 text-right">{tokens(slot.tokens_in)}</td>
							<td className="py-1.5 pr-3 text-right">{tokens(slot.tokens_out)}</td>
							<td className="py-1.5 text-right">{money(slot.cost)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
