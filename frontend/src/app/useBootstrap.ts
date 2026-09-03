'use client'

import { useEffect } from 'react'

/**
 * Первая загрузка состояния приложения.
 *
 * @param load — действие, которое тянет состав команды, пространства и модели
 */
export function useBootstrap(load: () => Promise<void>): void {
	useEffect(() => {
		void load()
	}, [load])
}
