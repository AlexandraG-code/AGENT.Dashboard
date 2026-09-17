'use client'
// Написано агентом middle (deepseek-v4-pro) по ТЗ главного архитектора.

import { useEffect, useState } from 'react'

import { fleetApi, type ChartOut } from '@/shared/api'

/**
 * Схема команды пространства с бэкенда: состав, подчинение и цепочки подмены.
 *
 * Считается на сервере, а не собирается во фронте: правила подмены живут
 * рядом с ролями, и повторять их в интерфейсе значит развести две правды.
 *
 * @param project — пространство, чью команду показываем
 */
export function useTeamChart(project: string): ChartOut | null {
	const [chart, setChart] = useState<ChartOut | null>(null)

	useEffect(() => {
		if (!project) return
		let alive = true
		fleetApi
			.chart(project)
			.then((data) => {
				if (alive) setChart(data)
			})
			.catch(() => undefined)
		return () => {
			alive = false
		}
	}, [project])

	// Пока пространство не выбрано, схемы нет: прежнюю не показываем, иначе на
	// экране окажется команда другого проекта.
	return project ? chart : null
}
