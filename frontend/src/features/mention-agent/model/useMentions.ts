// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.
'use client'

import { useState } from 'react'

import { applyMention, matchRoles, mentionQuery } from '../lib/mentions'

export interface IMentionAgent {
	name: string
	icon: string
	/** Показывать рядом с иконкой, если имя для людей отличается от ключа упоминания. */
	label: string
}

/**
 * Подсказки упоминаний в поле ввода: какая часть текста набрана после «@»,
 * кого можно позвать и подстановка выбранного имени на место набранного.
 *
 * @param agents — агенты, которых можно упомянуть (ключ, иконка, имя для людей)
 */
export function useMentions(agents: IMentionAgent[]) {
	const [draft, setDraft] = useState('')
	const [caret, setCaret] = useState(0)

	const query = mentionQuery(draft, caret)
	const names =
		query === null
			? []
			: matchRoles(
					agents.map((agent) => agent.name),
					query
				)
	const suggestions = names
		.map((name) => agents.find((agent) => agent.name === name))
		.filter((agent): agent is IMentionAgent => agent !== undefined)

	const change = (value: string, caretPosition: number) => {
		setDraft(value)
		setCaret(caretPosition)
	}

	const pick = (name: string) => {
		const next = applyMention(draft, caret, name)
		setDraft(next.text)
		setCaret(next.caret)
		return next.text
	}

	const reset = () => {
		setDraft('')
		setCaret(0)
	}

	return { draft, suggestions, change, pick, reset }
}
