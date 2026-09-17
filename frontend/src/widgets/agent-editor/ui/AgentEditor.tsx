'use client'

import { Alert, Form, Select } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ModelOut, RoleOut } from '@/shared/api'
import { useOrg } from '@/shared/model'
import { NavList, Panel } from '@/shared/ui'

import { useAgentForm } from '../model/useAgentForm'
import { useHints } from '../model/useHints'
import { useTeamForm } from '../model/useTeamForm'
import { useTeamSetup } from '../model/useTeamSetup'
import { AgentModal } from './AgentModal'
import { TeamCard } from './TeamCard'
import styles from './AgentEditor.module.scss'

interface IAgentEditorProps {
	project: string
	roles: RoleOut[]
	models: Record<string, ModelOut>
	onChanged: () => Promise<void> | void
}

/** Отдел для агентов без приписки: он не хранится, а собирается на лету. */
const FREE = '-'

/**
 * Состав команды: слева отделы, справа отдел с его правилами и агентами.
 * Карточка агента открывается поверх — так список остаётся перед глазами.
 *
 * @param project — пространство: состав команды принадлежит ему
 * @param roles — агенты с бэкенда
 * @param models — реестр моделей для карточки агента
 * @param onChanged — перечитать состояние приложения после изменений
 */
export function AgentEditor({ project, roles, models, onChanged }: IAgentEditorProps) {
	const { t } = useTranslation()
	const form = useAgentForm(project, roles, models, onChanged)
	const setup = useTeamSetup(project)
	const hints = useHints()
	const org = useOrg(project)
	const teamForm = useTeamForm(project)

	const current = teamForm.selected || FREE
	const members = roles.filter((role) => (role.team || FREE) === current)
	const free = roles.filter((role) => !role.team)

	const after = async (action: Promise<void>): Promise<void> => {
		await action
		await onChanged()
	}

	return (
		<div className={styles.layout}>
			<NavList
				items={[
					...org.teams.map((team) => ({
						id: team.name,
						title: team.title || team.name,
						note: t('org.membersCount', {
							count: roles.filter((role) => role.team === team.name).length
						})
					})),
					...(free.length > 0
						? [{ id: FREE, title: t('agents.noTeam'), note: t('org.membersCount', { count: free.length }) }]
						: [])
				]}
				value={current}
				onSelect={(id) => {
					const found = org.teams.find((team) => team.name === id)
					if (found) teamForm.select(found)
					else teamForm.reset()
				}}
				addLabel={t('org.addTeam')}
				onAdd={teamForm.startNew}
			/>

			<div className={styles.column}>
				{org.error && <Alert type="error" message={org.error} />}

				{teamForm.selected !== '' || teamForm.creating ? (
					<TeamCard
						project={project}
						form={teamForm}
						members={members}
						onSave={(body) => after(org.saveTeam(body))}
						onDelete={(name) => after(org.removeTeam(name))}
						onEditAgent={form.edit}
						onAddAgent={() => form.create(teamForm.selected)}
					/>
				) : (
					<Panel title={t('agents.noTeam')} subtitle={t('org.freeHint')}>
						<div className={styles.members}>
							{free.map((role) => (
								<button
									key={role.name}
									type="button"
									className={styles.member}
									onClick={() => form.edit(role.name)}
								>
									<span className={styles.memberIcon}>{role.icon || '🤖'}</span>
									<span className={styles.memberName}>
										{role.lead ? '★ ' : ''}
										{role.name}
									</span>
									<span className={styles.memberNote}>{role.model}</span>
								</button>
							))}
							<button type="button" className={styles.add} onClick={() => form.create('')}>
								{t('agents.add')}
							</button>
						</div>
					</Panel>
				)}

				<Panel title={t('agents.setupTitle')} subtitle={t('agents.setupSubtitle')}>
					<div className={styles.assignments}>
						{(setup.setup?.assignments ?? []).map((item) => (
							<Form.Item key={item.key} label={item.title} layout="vertical">
								<Select
									value={item.role || undefined}
									placeholder={t('agents.setupEmpty')}
									allowClear
									onChange={(value) => void setup.assign(item.key, value ?? '')}
									options={roles.map((role) => ({
										value: role.name,
										label: `${role.icon || '🤖'} ${role.name}`
									}))}
								/>
							</Form.Item>
						))}
					</div>
				</Panel>
			</div>

			<AgentModal
				form={form}
				models={models}
				teams={org.teams}
				setup={setup.setup}
				hints={hints}
				canDelete={roles.length > 1}
			/>
		</div>
	)
}
