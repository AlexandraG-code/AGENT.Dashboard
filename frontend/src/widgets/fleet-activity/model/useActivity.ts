'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.
// файл: frontend/src/widgets/fleet-activity/model/useActivity.ts
import { useEffect, useMemo, useState } from 'react'
import { fleetApi, type JobOut } from '@/shared/api'

interface IActivity {
	jobs: JobOut[]
	active: number
	byProject: Record<string, JobOut[]>
	recent: JobOut[]
	error: string
}

/**
 * Периодический опрос нужен потому, что фоновые задачи команды выполняются
 * на сервере без push-канала (нет WebSocket/SSE): дашборд — единственный
 * наблюдатель, поэтому единственный способ узнать о прогрессе и завершении —
 * повторять запрос. Интервал 2000 мс — компромисс между свежестью ленты
 * и нагрузкой на API; флаг «в полёте» защищает от наложения запросов,
 * когда ответ приходит дольше интервала.
 */
export function useActivity(): IActivity {
	const [jobs, setJobs] = useState<JobOut[]>([])
	const [active, setActive] = useState(0)
	const [error, setError] = useState('')

	useEffect(() => {
		let alive = true
		let inFlight = false

		const poll = async (): Promise<void> => {
			if (inFlight) return
			inFlight = true
			try {
				const data = await fleetApi.jobs(50)
				if (!alive) return
				setJobs(data.jobs)
				setActive(data.active)
				setError('')
			} catch {
				if (alive) setError('Не удалось получить список задач')
			} finally {
				inFlight = false
			}
		}

		void poll()
		const timer = setInterval(() => {
			void poll()
		}, 2000)

		return () => {
			alive = false
			clearInterval(timer)
		}
	}, [])

	const byProject = useMemo<Record<string, JobOut[]>>(() => {
		const groups: Record<string, JobOut[]> = {}
		for (const job of jobs) {
			if (job.status !== 'queued' && job.status !== 'running') continue
			const key = job.project || '—'
			;(groups[key] ??= []).push(job)
		}
		return groups
	}, [jobs])

	// Недавно законченное показываем рядом с активным: без этого окно процессов
	// почти всегда пустое и не отвечает на вопрос «кто чем занимался».
	const recent = useMemo<JobOut[]>(
		() => jobs.filter((job) => job.status === 'done' || job.status === 'failed').slice(0, 8),
		[jobs]
	)

	return { jobs, active, byProject, recent, error }
}
