'use client'

import { useCallback, useState } from 'react'

import { fleetApi, type DirEntry } from '@/shared/api'

/** Для какого поля открыт обзор: клон репозитория или папка данных проекта. */
export type DirTarget = 'repo' | 'data'

interface IDirPicker {
	open: boolean
	path: string
	parent: string | null
	entries: DirEntry[]
	busy: boolean
	error: string
	target: DirTarget
	/** Открыть обзор; пустой путь — начать с домашнего каталога. */
	show: (start: string, target: DirTarget) => void
	hide: () => void
	go: (path: string) => Promise<void>
}

/**
 * Обзор каталогов машины, на которой работает команда.
 *
 * Браузер абсолютный путь к папке отдать не может (`webkitdirectory` возвращает
 * только имена внутри выбранной папки), а бэкенду нужен именно абсолютный —
 * поэтому каталоги перечисляет API, а окно только ходит по ним.
 */
export function useDirPicker(): IDirPicker {
	const [open, setOpen] = useState(false)
	const [path, setPath] = useState('')
	const [parent, setParent] = useState<string | null>(null)
	const [entries, setEntries] = useState<DirEntry[]>([])
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [target, setTarget] = useState<DirTarget>('repo')

	const go = useCallback(async (next: string) => {
		setBusy(true)
		try {
			const listing = await fleetApi.dirs(next)
			setPath(listing.path)
			setParent(listing.parent ?? null)
			setEntries(listing.entries)
			setError('')
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}, [])

	return {
		open,
		path,
		parent,
		entries,
		busy,
		error,
		target,
		show: (start, next) => {
			setTarget(next)
			setOpen(true)
			void go(start)
		},
		hide: () => setOpen(false),
		go
	}
}
