import { cn } from '@/shared/lib/cn'

interface SeriesDotProps {
	color: string
	className?: string
}

/** Метка серии рядом с текстом: идентичность не должна держаться на одном цвете. */
export function SeriesDot({ color, className }: SeriesDotProps) {
	return (
		<span
			aria-hidden="true"
			className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-sm', className)}
			style={{ backgroundColor: color }}
		/>
	)
}
