'use client'

import { useState } from 'react'

import { fleetApi, type DocIn, type DocOut } from '@/shared/api'

export interface IDocForm {
	draft: DocIn
	selected: string
	isNew: boolean
	loading: boolean
	select: (id: string) => void
	startNew: (scope: string, team: string) => void
	patch: <K extends keyof DocIn>(key: K, value: DocIn[K]) => void
}

const empty = (project: string): DocIn => ({
	project,
	id: '',
	title: '',
	scope: 'space',
	team: '',
	order: 0,
	text: ''
})

/**
 * Черновик регламента: карточка и текст правятся одной формой.
 *
 * Текст тянется отдельным запросом и только по выбору документа: регламент —
 * это страницы, и возить их все в списке незачем.
 *
 * @param project — пространство, чьи регламенты правим
 */
export function useDocForm(project: string): IDocForm {
	const [draft, setDraft] = useState<DocIn>(empty(project))
	const [selected, setSelected] = useState<string>('')
	const [loading, setLoading] = useState<boolean>(false)

	return {
		draft,
		selected,
		loading,
		isNew: selected === '',
		select: (id) => {
			setSelected(id)
			setLoading(true)
			fleetApi
				.doc(project, id)
				.then((doc: DocOut & { text: string }) =>
					setDraft({
						project,
						id: doc.id,
						title: doc.title,
						scope: doc.scope,
						team: doc.team,
						order: doc.order,
						text: doc.text
					})
				)
				.catch(() => undefined)
				.finally(() => setLoading(false))
		},
		startNew: (scope, team) => {
			setSelected('')
			setDraft({ ...empty(project), scope, team })
		},
		patch: (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))
	}
}
