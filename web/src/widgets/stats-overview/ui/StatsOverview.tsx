'use client'

import { buildModelColors } from '@/shared/config'
import type { StatsOut } from '@/shared/api'
import { duration, money, tokens } from '@/shared/lib/format'
import { GlassCard } from '@/shared/ui/GlassCard'
import { StatTile } from '@/shared/ui/StatTile'

import { BreakdownTable } from './BreakdownTable'
import { DailySpend } from './DailySpend'
import { ModelBreakdown } from './ModelBreakdown'
import { ProjectBreakdown } from './ProjectBreakdown'

interface StatsOverviewProps {
	/** Человеческие названия пространств: в журнале лежат только идентификаторы. */
	titles: Record<string, string>
	/** Пустая строка — сводка по всем пространствам сразу. */
	project: string
	stats: StatsOut
}

/**
 * Сводная страница: сколько потрачено, кем и на что.
 * Данные тянутся одним запросом /api/stats — он уже отдаёт все разрезы,
 * поэтому фронт ничего не пересчитывает и цифры на всех блоках сходятся.
 */
export function StatsOverview({ titles, project, stats }: StatsOverviewProps) {
	const colors = buildModelColors(Object.keys(stats.models))
	const total = stats.total
	const paidCalls = Object.values(stats.models).reduce((sum, m) => sum + (m.cost > 0 ? m.calls : 0), 0)

	return (
		<div className="flex flex-col gap-3">
			{/* Шапка нужна печатной версии: на бумаге не видно ни вкладок, ни шапки приложения. */}
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="hidden print:block">
					<h2 className="text-lg font-semibold">Отчёт по расходам флота агентов</h2>
					<p className="text-sm text-slate-500">
						Сформирован {new Date().toLocaleString('ru-RU')} · период: последние {stats.daily.length} дн. ·{' '}
						{project ? `пространство: ${titles[project] ?? project}` : 'все пространства'}
					</p>
				</div>
				<button
					type="button"
					onClick={() => window.print()}
					className="ml-auto cursor-pointer rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:bg-white/10 print:hidden"
				>
					Выгрузить отчёт в PDF
				</button>
			</div>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<StatTile
					label="вызовов всего"
					value={String(total.calls)}
					hint={`за сутки ${stats.total_24h.calls}`}
				/>
				<StatTile
					label="потрачено"
					value={money(total.cost)}
					hint={`за сутки ${money(stats.total_24h.cost)}`}
					tone={total.cost > 0 ? 'neutral' : 'good'}
				/>
				<StatTile
					label="токенов на вход"
					value={tokens(total.tokens_in)}
					hint={`из кэша ${tokens(total.tokens_cached)}`}
				/>
				<StatTile
					label="токенов на выход"
					value={tokens(total.tokens_out)}
					hint={`размышления ${tokens(total.tokens_reasoning)}`}
				/>
				<StatTile
					label="платных вызовов"
					value={`${paidCalls} из ${total.calls}`}
					hint="остальное — подписка GLM"
					tone="good"
				/>
				<StatTile
					label="ошибок"
					value={String(total.errors)}
					tone={total.errors > 0 ? 'bad' : 'good'}
					hint={`время в моделях ${duration(total.seconds)}`}
				/>
			</div>

			<GlassCard title="Расход по дням" subtitle="последние 30 дней работы флота">
				<div className="mt-4">
					<DailySpend days={stats.daily} />
				</div>
			</GlassCard>

			<div className="grid gap-3 xl:grid-cols-2">
				<GlassCard title="По моделям" subtitle="сколько сожрала каждая модель по всем проектам">
					<div className="mt-4">
						<ModelBreakdown models={stats.models} colors={colors} />
					</div>
				</GlassCard>
				<GlassCard title="По проектам" subtitle="на что ушли деньги и токены">
					<div className="mt-4">
						<ProjectBreakdown projects={stats.projects} colors={colors} titles={titles} />
					</div>
				</GlassCard>
			</div>

			<GlassCard title="Проект × модель" subtitle="полная таблица — она же печатается в отчёт">
				<div className="mt-4">
					<BreakdownTable projects={stats.projects} titles={titles} />
				</div>
			</GlassCard>
		</div>
	)
}
