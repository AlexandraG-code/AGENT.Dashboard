// файл: frontend/src/widgets/fleet-activity/ui/JobChat.tsx
'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.
import { Alert, Modal, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import type { JobOut } from '@/shared/api'
import styles from './JobChat.module.scss'

interface IJobChatProps {
	/** Задача команды или null, если окно закрыто */
	job: JobOut | null
	/** Колбэк закрытия окна */
	onClose: () => void
}

/** Окно разговора агентов по одной задаче.
 * @param job - задача команды или null
 * @param onClose - колбэк закрытия окна
 */
export function JobChat({ job, onClose }: IJobChatProps) {
	const { t } = useTranslation()

	return (
		<Modal open={job !== null} onCancel={onClose} footer={null} width={800} title={t('activity.chatTitle')}>
			{job !== null && (
				<>
					<p className={styles.task}>{job.task}</p>
					{job.error !== '' && <Alert type="error" message={job.error} />}
					{job.steps.map((step, index) => (
						<article className={styles.step} key={`${step.at}-${index}`}>
							<header className={styles.head}>
								<b>{step.speaker}</b>
								<span className={styles.model}>{step.model}</span>
							</header>
							<pre className={styles.text}>{step.text}</pre>
						</article>
					))}
					{job.steps.length === 0 && job.status !== 'failed' && <Spin description={t('activity.working')} />}
				</>
			)}
		</Modal>
	)
}
