'use client'

import type { ModelOut, StatsOut } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'
import { GlassCard } from '@/shared/ui/GlassCard'

interface ProviderLimitsProps {
	models: Record<string, ModelOut>
	stats: StatsOut
	balance: number | null
}

/**
 * Остатки и нагрузка по провайдерам.
 *
 * Честно про источники: DeepSeek отдаёт баланс счёта — это настоящие деньги.
 * z.ai остаток подписки через API НЕ отдаёт (проверено: /usage, /account/quota
 * и заголовки ответа пустые), поэтому по GLM показываем собственный расход:
 * сколько вызовов и токенов сожрано за сутки и какой параллелизм разрешён тарифом.
 */
export function ProviderLimits({ models, stats, balance }: ProviderLimitsProps) {
	// Считаем по провайдеру, а не по модели: в счёт идёт вся семья сразу.
	const byProvider = new Map<string, { calls: number; cost: number; tin: number; tout: number; models: string[] }>()
	for (const [id, info] of Object.entries(models)) {
		const slot = byProvider.get(info.provider) ?? { calls: 0, cost: 0, tin: 0, tout: 0, models: [] }
		const stat = stats.models[id]
		slot.models.push(id)
		if (stat) {
			slot.calls += stat.calls
			slot.cost += stat.cost
			slot.tin += stat.tokens_in
			slot.tout += stat.tokens_out
		}
		byProvider.set(info.provider, slot)
	}

	const perDay = stats.daily.length > 0 ? stats.total.cost / stats.daily.length : 0
	const daysLeft = balance !== null && perDay > 0 ? Math.floor(balance / perDay) : null

	return (
		<div className="grid gap-3 md:grid-cols-2">
			{[...byProvider.entries()].map(([provider, slot]) => {
				const paid = slot.cost > 0
				return (
					<GlassCard
						key={provider}
						title={provider === 'glm' ? 'z.ai · GLM' : 'DeepSeek'}
						subtitle={paid ? 'оплата по токенам' : 'подписка Coding Plan — вызовы не тарифицируются'}
					>
						<dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm tabular-nums">
							<div>
								<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">
									остаток
								</dt>
								<dd className={paid ? 'text-emerald-400' : 'text-slate-300'}>
									{paid
										? balance === null
											? 'нет данных'
											: `$${balance.toFixed(2)}`
										: 'провайдер не отдаёт'}
								</dd>
							</div>
							<div>
								<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">
									потрачено всего
								</dt>
								<dd>{money(slot.cost)}</dd>
							</div>
							<div>
								<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">
									вызовов
								</dt>
								<dd>{slot.calls}</dd>
							</div>
							<div>
								<dt className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">
									токенов
								</dt>
								<dd>
									{tokens(slot.tin)}→{tokens(slot.tout)}
								</dd>
							</div>
						</dl>

						{paid && daysLeft !== null && (
							<p className="mt-3 text-xs text-slate-400">
								При нынешнем темпе ({money(perDay)} в день) хватит примерно на {daysLeft} дн.
							</p>
						)}

						<ul className="mt-3 flex flex-col gap-1 text-xs text-slate-400">
							{slot.models.map((id) => (
								<li key={id} className="flex justify-between gap-3">
									<span className="truncate">{id}</span>
									<span className="font-mono tabular-nums">
										параллелизм {models[id]?.concurrency}
										{models[id]?.vision ? ' · видит картинки' : ''}
									</span>
								</li>
							))}
						</ul>
					</GlassCard>
				)
			})}
		</div>
	)
}
