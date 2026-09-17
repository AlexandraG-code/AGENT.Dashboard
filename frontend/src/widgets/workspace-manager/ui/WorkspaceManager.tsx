'use client'

import { FolderOpenOutlined } from '@ant-design/icons'
import { Button, Form, Input, Select, Space, Switch } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ProjectOut } from '@/shared/api'
import { NavList, Panel, Toolbar } from '@/shared/ui'

import { useDirPicker } from '../model/useDirPicker'
import { CORE_NOTE, RULES_NOTE, useWorkspaceForm } from '../model/useWorkspaceForm'
import { DirPicker } from './DirPicker'
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
	const picker = useDirPicker()

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

					<Form layout="vertical">
						<Form.Item label={t('spaces.repo')} help={t('spaces.repoHint')}>
							<Space.Compact className={styles.repoField}>
								<Input
									value={form.repo}
									placeholder="~/проекты/мой-проект"
									onChange={(e) => form.setRepo(e.target.value)}
								/>
								<Button icon={<FolderOpenOutlined />} onClick={() => picker.show(form.repo, 'repo')}>
									{t('spaces.browse')}
								</Button>
							</Space.Compact>
						</Form.Item>
						<Form.Item label={t('spaces.dataDir')} help={t('spaces.dataDirHint')}>
							<Space.Compact className={styles.repoField}>
								<Input
									value={form.dataDir}
									placeholder={t('spaces.dataDirPlaceholder')}
									onChange={(e) => form.setDataDir(e.target.value)}
								/>
								<Button
									icon={<FolderOpenOutlined />}
									onClick={() => picker.show(form.dataDir, 'data')}
								>
									{t('spaces.browse')}
								</Button>
							</Space.Compact>
						</Form.Item>
						{form.selected === null && (
							<Form.Item label={t('spaces.copyTeam')} help={t('spaces.copyTeamHint')}>
								<Select
									value={form.copyFrom || undefined}
									placeholder={t('spaces.copyTeamEmpty')}
									allowClear
									onChange={(value: string | undefined) => form.setCopyFrom(value ?? '')}
									options={projects.map((item) => ({
										value: item.id,
										label: item.title.split(' — ')[0]
									}))}
								/>
							</Form.Item>
						)}
						<Form.Item label={t('spaces.signCode')} help={t('spaces.signCodeHint')}>
							<Switch checked={form.signCode} onChange={form.setSignCode} />
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
					<Form layout="vertical">
						<Form.Item label={t('spaces.globs')} help={t('spaces.globsHint')}>
							<Input.TextArea
								rows={3}
								value={form.globs}
								placeholder={t('spaces.globsPlaceholder')}
								onChange={(e) => form.setGlobs(e.target.value)}
							/>
						</Form.Item>
					</Form>
					<Toolbar>
						<Button onClick={() => void form.probe()} disabled={form.repo.trim() === ''}>
							{t('spaces.probe')}
						</Button>
						<span className={styles.hint}>
							{form.found.length > 0 ? t('spaces.probeFound', { count: form.found.length }) : ''}
						</span>
					</Toolbar>
					{form.found.length > 0 && (
						<ul className={styles.found}>
							{form.found.map((file) => (
								<li key={file}>{file}</li>
							))}
						</ul>
					)}
					<Toolbar>
						<Button
							type="primary"
							ghost
							disabled={form.busy || form.repo.trim() === ''}
							onClick={() => void form.importRules()}
						>
							{t('spaces.import')}
						</Button>
						<label className={styles.switch}>
							<Switch checked={form.compress} onChange={form.setCompress} />
							{t('spaces.compress')}
						</label>
						<span className={styles.hint}>
							{form.repo.trim() === '' ? t('spaces.importNeedsRepo') : form.repo}
						</span>
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

			<DirPicker
				open={picker.open}
				path={picker.path}
				parent={picker.parent}
				entries={picker.entries}
				busy={picker.busy}
				error={picker.error}
				onGo={(next) => void picker.go(next)}
				onPick={(next) => {
					if (picker.target === 'data') form.setDataDir(next)
					else form.pickRepo(next)
					picker.hide()
				}}
				onClose={picker.hide}
			/>
		</div>
	)
}
