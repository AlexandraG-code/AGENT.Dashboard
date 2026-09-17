'use client'

import clsx from 'clsx'
import { useEffect, useRef } from 'react'

import { startNeuralGlobe } from '@/shared/lib/neuralGlobe'

import styles from './NeuralGlobe.module.scss'

interface INeuralGlobeProps extends React.HTMLAttributes<HTMLSpanElement> {
	label?: string
}

/**
 * Знак команды: сфера из узлов и связей с бегущими импульсами.
 * Цвета берутся из токенов темы при монтировании, поэтому при смене оформления
 * знак пересоздаётся через `key`, а не следит за переменными сам.
 *
 * @param label — подпись для чтения с экрана; без неё знак считается украшением
 */
export function NeuralGlobe({ label, className, ...props }: INeuralGlobeProps) {
	const canvas = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const element = canvas.current
		if (!element) return
		const theme = getComputedStyle(document.documentElement)
		return startNeuralGlobe(element, {
			accent: theme.getPropertyValue('--accent').trim() || '#a78bfa',
			glow: theme.getPropertyValue('--info').trim() || '#38bdf8',
			animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
		})
	}, [])

	return (
		<span
			className={clsx(styles.mark, className)}
			role={label ? 'img' : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			{...props}
		>
			<canvas ref={canvas} className={styles.canvas} />
		</span>
	)
}
