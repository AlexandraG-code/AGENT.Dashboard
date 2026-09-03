'use client'

import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'

const control =
	'w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 outline-none transition duration-200 placeholder:text-slate-500 hover:ring-white/20 focus-visible:ring-2 focus-visible:ring-sky-400'

interface FieldProps {
	label: string
	/** id управляющего элемента: подпись связывается с ним через htmlFor. */
	id: string
	hint?: string
	error?: string
	className?: string
	children: ReactNode
}

export function Field({ label, id, hint, error, className, children }: FieldProps) {
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<label htmlFor={id} className="text-[11px] tracking-wide text-slate-400 uppercase">
				{label}
			</label>
			{children}
			{hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
			{error && <p className="text-xs text-rose-400">{error}</p>}
		</div>
	)
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input className={cn(control, className)} {...props} />
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea className={cn(control, 'resize-y leading-relaxed', className)} {...props} />
}
