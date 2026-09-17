// файл: frontend/src/widgets/team-chat/model/useTeamChat.ts
'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.

import { useEffect, useRef, useState } from 'react'
import { fleetApi, type ChatMessageOut } from '@/shared/api'

import { useChatDraft } from './useChatDraft'

export interface ITeamChat {
	messages: ChatMessageOut[]
	draft: string
	setDraft: (value: string) => void
	send: () => Promise<void>
	sending: boolean
	error: string
}

/**
 * Опрос вместо push: у API нет push-канала, а ответы агентов
 * приходят фоновыми задачами через минуты, поэтому чат
 * периодически перечитывает ленту.
 *
 * @param project — пространство, чью ленту читаем; у каждого свой черновик
 */
export function useTeamChat(project: string): ITeamChat {
	const [messages, setMessages] = useState<ChatMessageOut[]>([])
	const draft = useChatDraft((state) => state.drafts[project] ?? '')
	const restore = useChatDraft((state) => state.restore)
	const setStoredDraft = useChatDraft((state) => state.set)
	const clear = useChatDraft((state) => state.clear)

	const [error, setError] = useState<string>('')
	const [sending, setSending] = useState<boolean>(false)
	const inFlight = useRef(false)

	// Черновик поднимается из браузера после монтирования: на сервере
	// localStorage нет, а действие стора не считается setState в эффекте.
	useEffect(() => {
		restore(project)
	}, [project, restore])

	useEffect(() => {
		let alive = true

		const poll = async (): Promise<void> => {
			if (inFlight.current) return
			inFlight.current = true
			try {
				const { messages: fresh } = await fleetApi.chat(project, 100)
				if (alive) setMessages(fresh)
			} catch (err) {
				if (alive) setError(err instanceof Error ? err.message : String(err))
			} finally {
				inFlight.current = false
			}
		}

		void poll()
		const interval = setInterval(poll, 2000)

		return () => {
			alive = false
			clearInterval(interval)
		}
	}, [project])

	const setDraft = (value: string): void => {
		setStoredDraft(project, value)
	}

	const send = async (): Promise<void> => {
		if (!draft.trim()) return
		setSending(true)
		try {
			const { messages: published } = await fleetApi.postChat({
				project,
				author: 'human',
				text: draft
			})
			clear(project)
			const last = published[published.length - 1]
			if (last) setMessages((prev) => [...prev, last])
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setSending(false)
		}
	}

	return { messages, draft, setDraft, send, sending, error }
}
