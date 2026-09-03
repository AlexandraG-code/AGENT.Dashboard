'use client'

import { Button, Form, Input, Switch } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ProjectOut } from '@/shared/api'
import { NavList, Panel, Toolbar } from '@/shared/ui'

import { CORE_NOTE, RULES_NOTE, useWorkspaceForm } from '../model/useWorkspaceForm'
import styles from './WorkspaceManager.module.scss'

interface IWorkspaceManagerProps {
	projects: ProjectOut[]
	project: string
	onProjectChange: (id: string) => void
	onChanged: () => Promise<void> | void
}

/**
 * Пространства: здесь проект заводится и описывается. Описание и правила уходят
 * в промпт каждого агента целиком, поэтому правила можно не писать руками —
 * дашборд соберёт их из репозитория проекта и сожмёт в свод.
 *
 * @param projects — список пространств
 * @param project — выбранное пространство
 * @param onProjectChange — сменить выбранное пространство во всём приложении
 * @param onChanged — перечитать состояние приложения после изменения
 */
export function WorkspaceManager({ projects, project, onProjectChange, onChanged }: IWorkspaceManagerProps) {
	const { t } = useTranslation()
	const form = useWorkspaceForm({ projects, project, onProjectChange, onChanged })

	return (
		<div className={styles.layout}>
			<NavList
				items={projects.map((item) => ({ id: item.id, title: item.title.split(' — ')[0], note: item.id }))}
				value={form.selected}
				onSelect={form.select}
				addLabel={t('spaces.add')}
				onAdd={form.startNew}
			/>

			<div className={styles.column}>
				<Panel title={form.selected ? t('spaces.title') : t('spaces.newTitle')}>
					<Form layout="vertical" className={styles.head}>
						<Form.Item label={t('spaces.id')} help={t('spaces.idHint')}>
							<Input
								value={form.id}
								readOnly={form.selected !== null}
								placeholder="my-project"
								onChange={(e) => form.setId(e.target.value)}
							/>
						</Form.Item>
						<Form.Item label={t('spaces.name')}>
							<Input
								value={form.title}
								placeholder={t('spaces.namePlaceholder')}
								onChange={(e) => form.setTitle(e.target.value)}
							/>
						</Form.Item>
					</Form>
				</Panel>

				<Panel title={t('spaces.core')} subtitle={t('spaces.coreHint')}>
					<Form layout="vertical">
						<Form.Item label={CORE_NOTE}>
							<Input.TextArea
								rows={10}
								value={form.core}
								placeholder={t('spaces.corePlaceholder')}
								onChange={(e) => form.setCore(e.target.value)}
							/>
						</Form.Item>
					</Form>
				</Panel>

				<Panel title={t('spaces.rules')} subtitle={t('spaces.rulesHint')}>
					<Toolbar>
						<Form.Item
							label={t('spaces.repo')}
							help={t('spaces.repoHint')}
							layout="vertical"
							className={styles.repo}
						>
							<Input
								value={form.repo}
								placeholder="/Users/alex/WebstormProjects/мой-проект"
								onChange={(e) => form.setRepo(e.target.value)}
							/>
						</Form.Item>
						<label className={styles.switch}>
							<Switch checked={form.compress} onChange={form.setCompress} />
							{t('spaces.compress')}
						</label>
						<Button disabled={form.busy || form.repo.trim() === ''} onClick={() => void form.importRules()}>
							{t('spaces.import')}
						</Button>
					</Toolbar>

					<Form layout="vertical">
						<Form.Item label={RULES_NOTE}>
							<Input.TextArea
								rows={12}
								value={form.rules}
								placeholder={t('spaces.rulesPlaceholder')}
								onChange={(e) => form.setRules(e.target.value)}
							/>
						</Form.Item>
					</Form>
				</Panel>

				<Toolbar status={form.status} error={form.error}>
					<Button
						type="primary"
						loading={form.busy}
						disabled={form.id.trim() === ''}
						onClick={() => void form.save()}
					>
						{t('spaces.saveButton')}
					</Button>
					<Button danger disabled={form.selected === null} onClick={() => void form.remove()}>
						{t('common.delete')}
					</Button>
				</Toolbar>
			</div>
		</div>
	)
}
