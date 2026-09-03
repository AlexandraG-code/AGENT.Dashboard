'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/shared/lib/cn'
import { useUiSettings, type Contrast, type FontFamily, type Surface, type Weight } from '@/shared/model'

const FONTS: Array<{ id: FontFamily; label: string }> = [
	{ id: 'fira', label: 'Fira Sans' },
	{ id: 'system', label: 'Системный' },
	{ id: 'verdana', label: 'Verdana' }
]
const WEIGHTS: Array<{ id: Weight; label: string }> = [
	{ id: 'normal', label: 'обычный' },
	{ id: 'medium', label: 'плотный' },
	{ id: 'bold', label: 'жирный' }
]
const CONTRASTS: Array<{ id: Contrast; label: string }> = [
	{ id: 'normal', label: 'мягкий' },
	{ id: 'high', label: 'высокий' }
]
const SURFACES: Array<{ id: Surface; label: string }> = [
	{ id: 'glass', label: 'стекло' },
	{ id: 'solid', label: 'сплошной тёмный' },
	{ id: 'light', label: 'светлый' }
]

function Group<T extends string>({
	label,
	value,
	items,
	onPick
}: {
	label: string
	value: T
	items: Array<{ id: T; label: string }>
	onPick: (id: T) => void
}) {
	return (
		<div>
			<p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
			<div className="mt-1.5 flex flex-wrap gap-1.5">
				{items.map((item) => (
					<button
						key={item.id}
						type="button"
						onClick={() => onPick(item.id)}
						aria-pressed={value === item.id}
						className={cn(
							'cursor-pointer rounded-lg px-3 py-1.5 text-sm ring-1 transition',
							value === item.id
								? 'bg-emerald-600 text-emerald-50 ring-emerald-400/40'
								: 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10'
						)}
					>
						{item.label}
					</button>
				))}
			</div>
		</div>
	)
}

/**
 * Настройки читаемости прямо в шапке: кегль, шрифт, насыщенность, контраст, фон.
 * Всё сохраняется в браузере — дашборд открывается сразу таким, как удобно.
 */
export function UiSettings() {
	const { fontSize, weight, contrast, surface, font, set, reset, restore } = useUiSettings()
	const [open, setOpen] = useState(false)

	useEffect(() => {
		restore()
	}, [restore])

	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open])

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:bg-white/10"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
					<path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
					<circle cx="16" cy="7" r="2" />
					<circle cx="10" cy="17" r="2" />
				</svg>
				Вид
			</button>

			{open && (
				<div
					role="dialog"
					aria-label="Настройки интерфейса"
					className="absolute right-0 z-30 mt-2 flex w-[320px] flex-col gap-4 rounded-2xl bg-slate-900/95 p-4 ring-1 ring-white/15 backdrop-blur-xl"
				>
					<div>
						<div className="flex items-baseline justify-between">
							<p className="text-xs tracking-wide text-slate-400 uppercase">Размер текста</p>
							<span className="font-mono text-sm text-slate-300 tabular-nums">{fontSize} px</span>
						</div>
						<input
							type="range"
							min={14}
							max={26}
							step={1}
							value={fontSize}
							onChange={(e) => set({ fontSize: Number(e.target.value) })}
							className="mt-2 w-full cursor-pointer accent-emerald-500"
							aria-label="Размер текста"
						/>
					</div>

					<Group label="Шрифт" value={font} items={FONTS} onPick={(id) => set({ font: id })} />
					<Group label="Насыщенность" value={weight} items={WEIGHTS} onPick={(id) => set({ weight: id })} />
					<Group label="Контраст" value={contrast} items={CONTRASTS} onPick={(id) => set({ contrast: id })} />
					<Group label="Фон" value={surface} items={SURFACES} onPick={(id) => set({ surface: id })} />

					<div className="flex items-center justify-between">
						<button
							type="button"
							onClick={reset}
							className="cursor-pointer rounded-lg bg-white/5 px-3 py-1.5 text-sm ring-1 ring-white/10 transition hover:bg-white/10"
						>
							Сбросить
						</button>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-emerald-50 transition hover:bg-emerald-500"
						>
							Готово
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
