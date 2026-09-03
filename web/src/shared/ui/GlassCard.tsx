// файл: src/shared/ui/GlassCard.tsx
import { cn } from '@/shared/lib/cn'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
	title?: string
	subtitle?: string
	tone?: 'default' | 'accent' | 'danger'
	children: React.ReactNode
}

const toneClasses: Record<NonNullable<GlassCardProps['tone']>, string> = {
	default: 'ring-white/10',
	accent: 'ring-sky-400/20',
	danger: 'ring-red-400/20'
}

export function GlassCard({ title, subtitle, tone = 'default', className, children, ...props }: GlassCardProps) {
	return (
		<div
			className={cn(
				'rounded-2xl bg-white/5 p-4 shadow-lg ring-1 shadow-black/20 ring-white/10 backdrop-blur-xl',
				toneClasses[tone],
				className
			)}
			{...props}
		>
			{title && <h3 className="text-base font-semibold text-slate-100">{title}</h3>}
			{subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
			{children}
		</div>
	)
}
