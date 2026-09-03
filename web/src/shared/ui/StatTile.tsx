// файл: src/shared/ui/StatTile.tsx
import { cn } from '@/shared/lib/cn'

type StatTileProps = {
	label: string
	value: string
	hint?: string
	tone?: 'neutral' | 'good' | 'warn' | 'bad'
}

const toneClasses: Record<NonNullable<StatTileProps['tone']>, string> = {
	neutral: 'text-slate-100',
	good: 'text-emerald-400',
	warn: 'text-amber-400',
	bad: 'text-rose-400'
}

export function StatTile({ label, value, hint, tone = 'neutral' }: StatTileProps) {
	return (
		<div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur">
			<div className="text-xs tracking-wide text-slate-400 uppercase">{label}</div>
			<div className={cn('font-mono text-2xl tabular-nums', toneClasses[tone])}>{value}</div>
			{hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
		</div>
	)
}
