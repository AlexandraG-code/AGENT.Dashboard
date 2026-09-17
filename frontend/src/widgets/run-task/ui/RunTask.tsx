'use client'
// Переписано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.

import { Alert, Button, Form, Input, Select } from 'antd'
import { useTranslation } from 'react-i18next'

import type { RoleOut } from '@/shared/api'
import { Panel, Toolbar } from '@/shared/ui'

import { useRunTask } from '../model/useRunTask'
import styles from './RunTask.module.scss'

interface IRunTaskProps {
	roles: RoleOut[]
	project: string
}

/**
 * Запуск задачи прямо из интерфейса: одним агентом или советом, где консультант
 * предлагает решение, а оппонент его атакует. Работа уходит в фон: результат
 * доживает до возвращения на страницу, даже если вкладку закрыли.
 *
 * @param roles — состав команды для выбора исполнителя
 * @param project — выбранное пространство; его контекст подмешивает бэкенд
 */
export function RunTask({ roles, project }: IRunTaskProps) {
	const { t } = useTranslation()
	const form = useRunTask(project, roles[0]?.name ?? '')

	return (
		<Panel>
			<Toolbar error={form.error}>
				<Form.Item label={t('run.agent')} className={styles.field} layout="vertical">
					<Select
						value={form.role || roles[0]?.name}
						onChange={form.setRole}
						options={roles.map((role) => ({ value: role.name, label: `${role.name} — ${role.model}` }))}
					/>
				</Form.Item>
				<Form.Item label={t('run.mode')} className={styles.wide} layout="vertical">
					<Select
						value={form.mode}
						onChange={form.setMode}
						options={[
							{ value: 'run', label: t('run.modeSingle') },
							{ value: 'council', label: t('run.modeCouncil') }
						]}
					/>
				</Form.Item>
				<Button
					type="primary"
					loading={form.busy}
					disabled={form.task.trim() === ''}
					onClick={() => void form.run()}
				>
					{form.busy ? t('run.working') : t('run.start')}
				</Button>
				<span className={styles.meta}>
					{form.job
						? t('run.jobMeta', {
								status: t(`activity.status_${form.job.status}`),
								cost: form.job.cost,
								in: form.job.tokens_in,
								out: form.job.tokens_out
							})
						: ''}
				</span>
			</Toolbar>

			<Form.Item label={t('run.task')} help={t('run.taskHint')} layout="vertical">
				<Input.TextArea rows={7} value={form.task} onChange={(e) => form.setTask(e.target.value)} />
			</Form.Item>
			<Form.Item label={t('run.extra')} help={t('run.extraHint')} layout="vertical">
				<Input.TextArea rows={4} value={form.extra} onChange={(e) => form.setExtra(e.target.value)} />
			</Form.Item>

			{form.job && form.job.error !== '' && <Alert type="error" message={form.job.error} />}
			{form.job?.steps.map((step, index) => (
				<article key={`${step.at}-${index}`} className={styles.step}>
					<header className={styles.stepHead}>
						<b>{step.speaker}</b>
						<span className={styles.stepModel}>{step.model}</span>
					</header>
					<pre className={styles.output}>{step.text}</pre>
				</article>
			))}
		</Panel>
	)
}
