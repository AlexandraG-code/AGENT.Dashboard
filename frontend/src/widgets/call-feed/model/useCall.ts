'use client'

import { useEffect, useState } from 'react'

import { fleetApi, type CallOut } from '@/shared/api'

/**
 * Загрузка одного разговора для панели разбора.
 *
 * @param callId — идентификатор вызова; null означает, что панель закрыта
 */
export function useCall(callId: string | null): { call: CallOut | null; loading: boolean; error: string } {
	const [call, setCall] = useState<CallOut | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')

	useEffect(() => {
		if (!callId) return
		let alive = true

		const load = async () => {
			setLoading(true)
			setError('')
			try {
				const result = await fleetApi.call(callId)
				if (alive) setCall(result)
			} catch (e) {
				if (alive) setError(e instanceof Error ? e.message : String(e))
			} finally {
				if (alive) setLoading(false)
			}
		}

		void load()
		return () => {
			alive = false
		}
	}, [callId])

	return { call, loading, error }
}
