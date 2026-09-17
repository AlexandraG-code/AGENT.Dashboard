'use client'

import { useEffect, useState } from 'react'

import { fleetApi } from '@/shared/api'

export interface ITeamRules {
	text: string
	setText: (value: string) => void
	save: (title: string) => Promise<void>
	busy: boolean
}

/** Идентификатор общего регламента отдела: один документ на отдел, без списка. */
const docId = (team: string): string => `team-${team}`

/**
 * Правила отдела: как работают внутри — кто кому отдаёт результат, что делают
 * без спроса, а что выносят наверх. Это обычный регламент области «отдел»,
 * просто у него постоянный идентификатор: в карточке отдела нужен один текст,
 * а не список документов.
 *
 * @param project — пространство, которому принадлежит отдел
 * @param team — отдел; пустое значение означает, что редактировать нечего
 */
export function useTeamRules(project: string, team: string): ITeamRules {
	const [text, setText] = useState<string>('')
	const [busy, setBusy] = useState<boolean>(false)

	useEffect(() => {
		if (!project || !team) return
		let alive = true
		fleetApi
			.doc(project, docId(team))
			.then((doc) => {
				if (alive) setText(doc.text)
			})
			// Регламента ещё нет — это нормальное состояние нового отдела.
			.catch(() => {
				if (alive) setText('')
			})
		return () => {
			alive = false
		}
	}, [project, team])

	return {
		text,
		setText,
		busy,
		save: async (title) => {
			setBusy(true)
			try {
				await fleetApi.saveDoc({
					project,
					id: docId(team),
					title,
					scope: 'team',
					team,
					order: 0,
					text
				})
			} finally {
				setBusy(false)
			}
		}
	}
}
