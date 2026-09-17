'use client'

import { Button, Form, Input, Upload } from 'antd'
import { useTranslation } from 'react-i18next'

import type { RoleOut, TeamIn } from '@/shared/api'
import { Avatar, Panel } from '@/shared/ui'

import { useTeamForm } from '../model/useTeamForm'
import { useTeamRules } from '../model/useTeamRules'
import styles from './AgentEditor.module.scss'

interface ITeamCardProps {
	project: string
	form: ReturnType<typeof useTeamForm>
	members: RoleOut[]
	onSave: (body: TeamIn) => Promise<void>
	onDelete: (name: string) => Promise<void>
	onEditAgent: (name: string) => void
	onAddAgent: () => void
}

/**
 * Отдел: чем занимается, по каким правилам работает внутри и кто в нём состоит.
 * Правила отдела попадают в системный промпт каждого его агента — там же, где
 * общие регламенты организации, но ниже них.
 *
 * @param project — пространство: отдел принадлежит его команде
 * @param form — черновик отдела
 * @param members — агенты этого отдела
 * @param onSave — сохранить отдел
 * @param onDelete — убрать отдел (агенты останутся без приписки)
 * @param onEditAgent — открыть карточку агента
 * @param onAddAgent — завести агента сразу в этом отделе
 */
export function TeamCard({ project, form, members, onSave, onDelete, onEditAgent, onAddAgent }: ITeamCardProps) {
	const { t } = useTranslation()
	const rules = useTeamRules(project, form.selected)
	const title = form.draft.title || form.draft.name

	return (
		<Panel>
			<Form layout="vertical">
				<div className={styles.fields}>
					<Form.Item label={t('org.teamName')}>
						<Input
							value={form.draft.name}
							readOnly={!form.isNew}
							onChange={(e) => form.patch('name', e.target.value)}
						/>
					</Form.Item>
					<Form.Item label={t('org.teamTitle')}>
						<Input value={form.draft.title} onChange={(e) => form.patch('title', e.target.value)} />
					</Form.Item>
				</div>

				<Form.Item label={t('org.teamAbout')} help={t('org.teamAboutHint')}>
					<Input.TextArea
						rows={2}
						value={form.draft.description ?? ''}
						onChange={(e) => form.patch('description', e.target.value)}
					/>
				</Form.Item>

				<div className={styles.actions}>
					<Button
						type="primary"
						disabled={!form.draft.name.trim()}
						onClick={() =>
							void onSave({
								project,
								name: form.draft.name,
								title: form.draft.title ?? '',
								description: form.draft.description ?? ''
							})
						}
					>
						{t('common.save')}
					</Button>
					{!form.isNew && (
						<Button danger onClick={() => void onDelete(form.selected).then(form.startNew)}>
							{t('org.deleteTeam')}
						</Button>
					)}
				</div>
			</Form>

			{!form.isNew && (
				<>
					<Form layout="vertical">
						<Form.Item label={t('org.teamRules')} help={t('org.teamRulesHint')}>
							<Input.TextArea
								rows={8}
								value={rules.text}
								placeholder={t('org.teamRulesPlaceholder')}
								onChange={(e) => rules.setText(e.target.value)}
							/>
						</Form.Item>
						<div className={styles.actions}>
							<Button
								loading={rules.busy}
								onClick={() => void rules.save(t('org.teamRulesTitle', { team: title }))}
							>
								{t('org.saveRules')}
							</Button>
							<Upload
								accept=".md,.txt"
								showUploadList={false}
								beforeUpload={(file) => {
									void file.text().then(rules.setText)
									return false
								}}
							>
								<Button>{t('org.upload')}</Button>
							</Upload>
						</div>
					</Form>

					<h3 className={styles.membersTitle}>{t('org.members')}</h3>
					<div className={styles.members}>
						{members.map((role) => (
							<button
								key={role.name}
								type="button"
								className={styles.member}
								onClick={() => onEditAgent(role.name)}
							>
								<Avatar project={project} name={role.name} icon={role.icon} size={40} />
								<span className={styles.memberName}>
									{role.lead ? '★ ' : ''}
									{role.name}
								</span>
								<span className={styles.memberNote}>{role.model}</span>
							</button>
						))}
						<button type="button" className={styles.add} onClick={onAddAgent}>
							{t('agents.add')}
						</button>
					</div>
				</>
			)}
		</Panel>
	)
}
