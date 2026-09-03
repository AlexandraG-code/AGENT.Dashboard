// файл: src/shared/ui/Tabs.tsx
'use client'

import { useCallback, useRef } from 'react'
import { cn } from '@/shared/lib/cn'

interface TabsProps {
	items: { id: string; label: string }[]
	value: string
	onChange: (id: string) => void
}

export function Tabs({ items, value, onChange }: TabsProps) {
	const listRef = useRef<HTMLDivElement>(null)

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
			event.preventDefault()
			const index = items.findIndex((item) => item.id === value)
			if (index === -1) return
			const next =
				event.key === 'ArrowRight' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
			const nextItem = items[next]
			onChange(nextItem.id)
			const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
			buttons?.[next]?.focus()
		},
		[items, value, onChange]
	)

	return (
		<div
			ref={listRef}
			role="tablist"
			onKeyDown={handleKeyDown}
			className="inline-flex gap-1 rounded-2xl bg-white/5 p-1 ring-1 ring-white/10 backdrop-blur"
		>
			{items.map((item) => {
				const selected = item.id === value
				return (
					<button
						key={item.id}
						type="button"
						role="tab"
						aria-selected={selected}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(item.id)}
						className={cn(
							'rounded-xl px-4 py-2 transition-colors',
							'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none',
							selected
								? 'bg-white/10 text-slate-100 ring-1 ring-white/15'
								: 'text-slate-400 hover:text-slate-100'
						)}
					>
						{item.label}
					</button>
				)
			})}
		</div>
	)
}
