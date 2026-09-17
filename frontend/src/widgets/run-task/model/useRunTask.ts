'use client'
// Написано агентом senior (deepseek-v4-pro) по ТЗ главного архитектора;
// правки главного: пустая строка вместо null в ошибке — её ждёт Toolbar.

import { useEffect, useState } from 'react'

import { fleetApi, type JobOut } from '@/shared/api'
import { useAction } from '@/shared/lib/useAction'

type Mode = 'run' | 'council'

const isJobActive = (status: string) => status === 'queued' || status === 'running'

/**
 * Запуск задач через фоновые задания: работа переживает закрытие вкладки и
 * падение Claude Code, поэтому результат не теряется при обрыве соединения.
 * Дашборд узнаёт о ходе дела опросом — push-канала у API нет.
 *
 * @param project — пространство, чей контекст подмешивается в промпт
 * @param defaultRole — роль по умолчанию: первая в списке команды
 */
export function useRunTask(project: string, defaultRole: string) {
	const [role, setRole] = useState(defaultRole)
	const [mode, setMode] = useState<Mode>('run')
	const [task, setTask] = useState('')
	const [extra, setExtra] = useState('')
	const [applyFiles, setApplyFiles] = useState(false)
	const [job, setJob] = useState<JobOut | null>(null)
	const [pollError, setPollError] = useState('')

	const startJobAction = useAction(async () => {
		setPollError('')
		setJob(null)
		const newJob = await fleetApi.startJob({
			kind: mode,
			project,
			role: role || defaultRole,
			task,
			extra,
			rounds: 2,
			apply_files: applyFiles
		})
		setJob(newJob)
	})

	// Эффекту нужен только идентификатор задачи, а не вся её карточка: иначе
	// он перезапускался бы на каждое обновление ответа.
	const jobId = job?.id
	const jobStatus = job?.status

	useEffect(() => {
		if (!jobId || !jobStatus || !isJobActive(jobStatus)) return

		let cancelled = false
		const interval = window.setInterval(async () => {
			try {
				const updatedJob = await fleetApi.job(jobId)
				if (!cancelled) {
					setJob(updatedJob)
					setPollError('')
				}
			} catch (err) {
				if (!cancelled) {
					setPollError(err instanceof Error ? err.message : String(err))
				}
			}
		}, 2000)

		return () => {
			cancelled = true
			window.clearInterval(interval)
		}
	}, [jobId, jobStatus])

	return {
		role,
		setRole,
		mode,
		setMode,
		task,
		setTask,
		extra,
		setExtra,
		applyFiles,
		setApplyFiles,
		job,
		busy: startJobAction.busy || (job !== null && isJobActive(job.status)),
		run: startJobAction.run,
		error: startJobAction.error || pollError
	}
}
