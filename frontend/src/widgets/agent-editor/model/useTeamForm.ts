'use client'

import { useState } from 'react'

import type { TeamIn, TeamOut } from '@/shared/api'

export interface ITeamForm {
	draft: TeamIn
	selected: string
	isNew: boolean
	creating: boolean
	select: (team: TeamOut) => void
	startNew: () => void
	reset: () => void
	patch: <K extends keyof TeamIn>(key: K, value: TeamIn[K]) => void
}

const empty = (project: string): TeamIn => ({ project, name: '', title: '', description: '' })

/**
 * Черновик отдела: имя и описание круга задач.
 *
 * @param project — пространство, которому принадлежит отдел вместе со всей командой
 */
export function useTeamForm(project: string): ITeamForm {
	const [draft, setDraft] = useState<TeamIn>(empty(project))
	const [selected, setSelected] = useState<string>('')
	// Создание отдела — отдельное состояние: пустой выбор означает ещё и
	// «показываю агентов без отдела», и по одному имени их не различить.
	const [creating, setCreating] = useState<boolean>(false)

	return {
		draft,
		selected,
		creating,
		isNew: selected === '',
		select: (team) => {
			setSelected(team.name)
			setCreating(false)
			setDraft({
				project,
				name: team.name,
				title: team.title,
				description: team.description
			})
		},
		startNew: () => {
			setSelected('')
			setCreating(true)
			setDraft(empty(project))
		},
		reset: () => {
			setSelected('')
			setCreating(false)
			setDraft(empty(project))
		},
		patch: (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))
	}
}
