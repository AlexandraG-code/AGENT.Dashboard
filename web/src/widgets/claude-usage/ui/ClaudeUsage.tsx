'use client'

import type { ClaudeStat } from '@/shared/api'
import { tokens } from '@/shared/lib/format'
import { GlassCard } from '@/shared/ui/GlassCard'

interface ClaudeUsageProps {
	claude: ClaudeStat
}

/**
 * Расход самого Claude Code — того, кто раздаёт задачи флоту.
 *
 * Цифры берутся из журналов сессий Claude Code, а не из нашего клиента, поэтому
 * стоимость здесь не показывается: работа идёт по подписке, цены за токен нет,
 * и выдумывать её в отчёте о расходах нельзя.
 */
export function ClaudeUsage({ claude }: ClaudeUsageProps) {
	if (!claude.available) {
		return null
	}

	const projects = Object.entries(claude.projects)
		.sort((a, b) => b[1].tokens_in + b[1].tokens_out - (a[1].tokens_in + a[1].tokens_out))
		.slice(0, 8)
	const peak = Math.max(...projects.map(([, s]) => s.tokens_in + s.tokens_out), 1)

	return (
		<GlassCard
			title="Claude Code — главный архитектор"
			subtitle="по подписке, поэтому в деньгах не считается: здесь только объём работы"
		>
			<dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm tabular-nums sm:grid-cols-5">
				<div>
					<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">ответов</dt>
					<dd>{claude.total.calls}</dd>
				</div>
				<div>
					<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">вход</dt>
					<dd>{tokens(claude.total.tokens_in)}</dd>
				</div>
				<div>
					<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">из кэша</dt>
					<dd className="text-emerald-400">{tokens(claude.total.tokens_cached)}</dd>
				</div>
				<div>
					<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">выход</dt>
					<dd>{tokens(claude.total.tokens_out)}</dd>
				</div>
				<div>
					<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">размышления</dt>
					<dd>{tokens(claude.total.tokens_reasoning)}</dd>
				</div>
			</dl>

			<p className="mt-4 text-[11px] tracking-wide text-slate-400 uppercase">по каталогам работы</p>
			<ul className="mt-2 flex flex-col gap-2">
				{projects.map(([name, slot]) => {
					const total = slot.tokens_in + slot.tokens_out
					return (
						<li key={name}>
							<div className="flex items-baseline justify-between gap-3 text-sm">
								<span className="truncate text-slate-100">{name}</span>
								<span className="font-mono text-xs text-slate-400 tabular-nums">
									{tokens(slot.tokens_in)}→{tokens(slot.tokens_out)}
								</span>
							</div>
							<div
								className="mt-1 h-1.5 rounded-sm bg-violet-600"
								style={{ width: `${Math.max(2, (total / peak) * 100)}%` }}
							/>
						</li>
					)
				})}
			</ul>
		</GlassCard>
	)
}
