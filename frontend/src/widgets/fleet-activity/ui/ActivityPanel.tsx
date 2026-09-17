'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.
import { useTranslation } from 'react-i18next'
import { Button, Tag } from 'antd'
import type { JobOut } from '@/shared/api'
import styles from './ActivityPanel.module.scss'

interface IActivityPanelProps {
	byProject: Record<string, JobOut[]>
	recent: JobOut[]
	titles: Record<string, string>
	onOpen: (jobId: string) => void
}

/**
 * Содержимое всплывающего окна со списком запущенных процессов команды.
 *
 * @param byProject - запущенные процессы команды, сгруппированные по проектам.
 * @param recent - последние завершённые задачи.
 * @param titles - человекочитаемые названия пространств по ключу проекта.
 * @param onOpen - колбэк открытия карточки задачи по id.
 */
export function ActivityPanel({ byProject, recent, titles, onOpen }: IActivityPanelProps) {
	const { t } = useTranslation()

	if (Object.keys(byProject).length === 0 && recent.length === 0) {
		return <p className={styles.empty}>{t('activity.empty')}</p>
	}

	return (
		<div>
			{Object.entries(byProject).map(([key, jobs]) => (
				<div key={key}>
					<h4 className={styles.space}>{titles[key] ?? key}</h4>
					<ul className={styles.list}>
						{jobs.map((job) => (
							<li key={job.id}>
								<Button type="link" size="small" onClick={() => onOpen(job.id)}>
									{job.task.length > 70 ? `${job.task.slice(0, 70)}…` : job.task}
								</Button>
								<Tag>{t(`activity.status_${job.status}`)}</Tag>
								<span className={styles.meta}>{job.role}</span>
							</li>
						))}
					</ul>
				</div>
			))}

			{recent.length > 0 && (
				<div>
					<h4 className={styles.space}>{t('activity.recent')}</h4>
					<ul className={styles.list}>
						{recent.map((job) => (
							<li key={job.id}>
								<Button type="link" size="small" onClick={() => onOpen(job.id)}>
									{job.task.length > 70 ? `${job.task.slice(0, 70)}…` : job.task}
								</Button>
								<Tag>{t(`activity.status_${job.status}`)}</Tag>
								<span className={styles.meta}>
									{`${job.role} · ${titles[job.project] ?? job.project ?? '—'}`}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	)
}
