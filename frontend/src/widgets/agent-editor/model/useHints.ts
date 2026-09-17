'use client'

import { useEffect, useState } from 'react'

import { fleetApi, type HintOut } from '@/shared/api'

/**
 * Подсказки к системному промпту.
 *
 * Их состав — данные пользователя: приложение только показывает готовые куски
 * текста, чтобы не набирать руками одно и то же в каждой роли.
 */
export function useHints(): HintOut[] {
	const [hints, setHints] = useState<HintOut[]>([])

	useEffect(() => {
		let alive = true
		fleetApi
			.hints()
			.then((data) => {
				if (alive) setHints(data.hints)
			})
			.catch(() => undefined)
		return () => {
			alive = false
		}
	}, [])

	return hints
}
