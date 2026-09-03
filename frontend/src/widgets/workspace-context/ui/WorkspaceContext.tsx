'use client'

import { UploadOutlined } from '@ant-design/icons'
import { Button, Form, Input, Select, Upload } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ProjectOut } from '@/shared/api'
import { NavList, Panel, Toolbar } from '@/shared/ui'

import { ALWAYS_IN_PROMPT, useContextNotes } from '../model/useContextNotes'
import styles from './WorkspaceContext.module.scss'

interface IWorkspaceContextProps {
	projects: ProjectOut[]
	project: string
	onProjectChange: (id: string) => void
}

/**
 * Память пространства: сюда грузят файлы и куски текста, здесь же лежат заметки.
 * Само пространство и его правила заводятся на вкладке «Пространства» — это
 * разные задачи: там настраивают проект, здесь наполняют его память.
 *
 * @param projects — список пространств для выбора цели загрузки
 * @param project — выбранное пространство
 * @param onProjectChange — сменить выбранное пространство во всём приложении
 */
export function WorkspaceContext({ projects, project, onProjectChange }: IWorkspaceContextProps) {
	const { t } = useTranslation()
	const form = useContextNotes(project)
	const notes = Object.keys(form.context?.notes ?? {})

	return (
		<div className={styles.page}>
			<Panel title={t('context.targetTitle')} subtitle={t('context.targetHint')}>
				<Form layout="vertical" className={styles.target}>
					<Form.Item label={t('app.space')}>
						<Select
							value={project || undefined}
							placeholder={t('context.choose')}
							onChange={onProjectChange}
							options={projects.map((item) => ({
								value: item.id,
								label: item.title.split(' — ')[0]
							}))}
						/>
					</Form.Item>
				</Form>
			</Panel>

			<div className={styles.columns}>
				<Panel title={t('context.fileTitle')} subtitle={t('context.fileHint')}>
					<Toolbar>
						<Upload
							maxCount={1}
							beforeUpload={(file) => {
								// Загрузку делает не antd, а наш запрос: он ещё и разбирает файл.
								form.setFile(file)
								return false
							}}
							onRemove={() => form.setFile(null)}
						>
							<Button icon={<UploadOutlined />}>{t('context.file')}</Button>
						</Upload>
						<Button
							type="primary"
							loading={form.busy}
							disabled={!project || form.file === null}
							onClick={() => void form.upload()}
						>
							{t('context.parse')}
						</Button>
					</Toolbar>
					<p className={styles.hint}>{t('context.fileNote')}</p>
				</Panel>

				<Panel title={t('context.pasteTitle')} subtitle={t('context.pasteHint')}>
					<Form layout="vertical">
						<Form.Item label={t('context.source')}>
							<Input
								value={form.source}
								placeholder={t('context.sourcePlaceholder')}
								onChange={(e) => form.setSource(e.target.value)}
							/>
						</Form.Item>
						<Form.Item label={t('context.text')}>
							<Input.TextArea
								rows={6}
								value={form.paste}
								onChange={(e) => form.setPaste(e.target.value)}
							/>
						</Form.Item>
					</Form>
					<Toolbar>
						<Button
							type="primary"
							loading={form.busy}
							disabled={!project}
							onClick={() => void form.digest()}
						>
							{t('context.parse')}
						</Button>
					</Toolbar>
				</Panel>
			</div>

			<Panel>
				<Form layout="vertical">
					<Form.Item label={t('context.question')} help={t('context.questionHint')}>
						<Input value={form.question} onChange={(e) => form.setQuestion(e.target.value)} />
					</Form.Item>
				</Form>
				<Toolbar status={form.status} error={form.error} />
			</Panel>

			<div className={styles.notes}>
				<NavList
					items={notes.map((noteName) => ({
						id: noteName,
						title: noteName,
						note: `${t('context.chars', { count: (form.context?.notes[noteName] ?? '').length })}${
							ALWAYS_IN_PROMPT.includes(noteName) ? ` · ${t('context.always')}` : ''
						}`
					}))}
					value={form.name}
					onSelect={form.openNote}
					emptyLabel={t('context.noNotes')}
				/>

				<Panel>
					<Toolbar>
						<Form.Item label={t('context.noteName')} layout="vertical">
							<Input value={form.name} onChange={(e) => form.setName(e.target.value)} />
						</Form.Item>
						<Button
							type="primary"
							loading={form.busy}
							disabled={!project || form.name.trim() === ''}
							onClick={() => void form.save()}
						>
							{t('common.save')}
						</Button>
					</Toolbar>
					<Input.TextArea
						rows={16}
						value={form.text}
						placeholder={t('context.notePlaceholder')}
						onChange={(e) => form.setText(e.target.value)}
					/>
				</Panel>
			</div>
		</div>
	)
}
