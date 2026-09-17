'use client'

import { useEffect, useRef } from 'react'

import { startNeuralMesh } from '@/shared/lib/neuralMesh'

import styles from './NeuralField.module.scss'

interface INeuralFieldProps {
	enabled: boolean
}

/**
 * Фоновый слой: объёмный граф из узлов и связей, по которым бегут импульсы.
 * Цвета берутся из текущих токенов темы, поэтому слой перерисовывается через
 * `key` при смене оформления, а не следит за переменными сам.
 *
 * @param enabled — рисовать ли сетку; выключено в настройках «Вида» — канваса нет вовсе
 */
export function NeuralField({ enabled }: INeuralFieldProps) {
	const canvas = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const element = canvas.current
		if (!element) return
		const theme = getComputedStyle(document.documentElement)
		return startNeuralMesh(element, {
			accent: theme.getPropertyValue('--accent').trim() || '#a78bfa',
			glow: theme.getPropertyValue('--info').trim() || '#38bdf8',
			// Движение на фоне мешает тем, кому оно противопоказано: у них сетка
			// рисуется одним кадром и замирает.
			animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
		})
	}, [])

	if (!enabled) return null

	return <canvas ref={canvas} className={styles.field} aria-hidden />
}
