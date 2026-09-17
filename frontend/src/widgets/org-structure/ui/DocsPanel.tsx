'use client'

import { Button, Form, Input, Select, Spin, Upload } from 'antd'
import { useTranslation } from 'react-i18next'

import type { DocIn, DocOut, ScopeOut, TeamOut } from '@/shared/api'
import { NavList, Panel } from '@/shared/ui'

import { useDocForm } from '../model/useDocForm'
import styles from './OrgStructure.module.scss'

interface IDocsPanelProps {
	project: string
	documents: DocOut[]
	scopes: ScopeOut[]
	teams: TeamOut[]
	onSave: (body: DocIn) => Promise<void>
	onDelete: (id: string) => Promise<void>
	onUpload: (file: File, scope: string, project: string, team: string) => Promise<void>
}

/**
 * Регламенты: устав пространства и распорядок отдела. Текст попадает в
 * системный промпт каждого подходящего агента до его ролевого промпта, поэтому
 * область действия — обязательное поле, а не украшение.
 *
 * @param project — пространство, чьи регламенты правим
 * @param documents — карточки регламентов
 * @param scopes — области действия с бэкенда
 * @param teams — отделы для области «отдел»
 * @param onSave — сохранить карточку вместе с текстом
 * @param onDelete — убрать регламент вместе с текстом
 * @param onUpload — загрузить готовый документ файлом
 */
export function DocsPanel({ project, documents, scopes, teams, onSave, onDelete, onUpload }: IDocsPanelProps) {
	const { t } = useTranslation()
	const form = useDocForm(project)
	const scope = form.draft.scope ?? 'space'

	return (
		<div className={styles.layout}>
			<NavList
				items={documents.map((doc) => ({
					id: doc.id,
					title: doc.title,
					note: `${scopes.find((s) => s.key === doc.scope)?.title ?? doc.scope} · ${t('org.chars', { count: doc.chars })}`
				}))}
				value={form.selected}
				onSelect={form.select}
				addLabel={t('org.addDoc')}
				onAdd={() => form.startNew('space', '')}
			/>

			<Panel>
				{form.loading ? (
					<Spin description={t('org.loading')} />
				) : (
					<Form layout="vertical">
						<div className={styles.fields}>
							<Form.Item label={t('org.docTitle')}>
								<Input
									value={form.draft.title}
									onChange={(e) => form.patch('title', e.target.value)}
								/>
							</Form.Item>
							<Form.Item label={t('org.scope')} help={t('org.scopeHint')}>
								<Select
									value={scope}
									onChange={(value: string) => form.patch('scope', value)}
									options={scopes.map((item) => ({ value: item.key, label: item.title }))}
								/>
							</Form.Item>
							{scope === 'team' && (
								<Form.Item label={t('org.team')}>
									<Select
										value={form.draft.team ?? ''}
										onChange={(value: string) => form.patch('team', value)}
										options={teams.map((item) => ({
											value: item.name,
											label: item.title || item.name
										}))}
									/>
								</Form.Item>
							)}
						</div>

						<Form.Item label={t('org.docText')} help={t('org.docTextHint')}>
							<Input.TextArea
								rows={16}
								value={form.draft.text ?? ''}
								placeholder={t('org.docPlaceholder')}
								onChange={(e) => form.patch('text', e.target.value)}
							/>
						</Form.Item>

						<div className={styles.actions}>
							<Button
								type="primary"
								disabled={!(form.draft.title ?? '').trim()}
								onClick={() => onSave(form.draft)}
							>
								{t('common.save')}
							</Button>
							<Upload
								accept=".md,.txt"
								showUploadList={false}
								beforeUpload={(file) => {
									void onUpload(file, scope, project, form.draft.team ?? '')
									return false
								}}
							>
								<Button>{t('org.upload')}</Button>
							</Upload>
							{!form.isNew && (
								<Button danger onClick={() => onDelete(form.selected).then(() => form.startNew('space', ''))}>
									{t('org.deleteDoc')}
								</Button>
							)}
						</div>
					</Form>
				)}
			</Panel>
		</div>
	)
}
