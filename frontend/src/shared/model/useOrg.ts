'use client'

import { useCallback, useEffect, useState } from 'react'

import { fleetApi, type DocIn, type DocOut, type ScopeOut, type TeamIn, type TeamOut } from '@/shared/api'

export interface IOrg {
	teams: TeamOut[]
	documents: DocOut[]
	scopes: ScopeOut[]
	error: string
	reload: () => void
	saveTeam: (body: TeamIn) => Promise<void>
	removeTeam: (name: string) => Promise<void>
	saveDoc: (body: DocIn) => Promise<void>
	removeDoc: (id: string) => Promise<void>
	uploadDoc: (file: File, scope: string, project: string, team: string) => Promise<void>
}

/**
 * Отделы и регламенты пространства — общие данные для нескольких виджетов.
 *
 * Состав приходит с бэкенда целиком: и то и другое — данные человека, а не
 * знание приложения, поэтому фронт ничего про отделы и области не додумывает.
 *
 * @param project — пространство: отделы и регламенты принадлежат его команде
 */
export function useOrg(project: string): IOrg {
	const [teams, setTeams] = useState<TeamOut[]>([])
	const [documents, setDocuments] = useState<DocOut[]>([])
	const [scopes, setScopes] = useState<ScopeOut[]>([])
	const [error, setError] = useState<string>('')

	const reload = useCallback(() => {
		if (!project) return
		fleetApi
			.org(project)
			.then((data) => {
				setTeams(data.teams)
				setDocuments(data.documents)
				setScopes(data.scopes)
				setError('')
			})
			.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
	}, [project])

	useEffect(() => {
		reload()
	}, [reload])

	const guard = async (action: Promise<unknown>): Promise<void> => {
		try {
			await action
			setError('')
			reload()
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	return {
		// Пока пространство не выбрано, отделов и регламентов нет: показывать
		// прежние значит показывать чужую команду.
		teams: project ? teams : [],
		documents: project ? documents : [],
		scopes,
		error,
		reload,
		saveTeam: (body) => guard(fleetApi.saveTeam(body)),
		removeTeam: (name) => guard(fleetApi.deleteTeam(project, name)),
		saveDoc: (body) => guard(fleetApi.saveDoc(body)),
		removeDoc: (id) => guard(fleetApi.deleteDoc(project, id)),
		uploadDoc: (file, scope, project, team) => guard(fleetApi.uploadDoc(file, scope, project, team))
	}
}
