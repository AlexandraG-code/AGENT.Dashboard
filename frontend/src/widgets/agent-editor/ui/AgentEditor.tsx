'use client'

import { Button, Form, Input, InputNumber, Select, Switch } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ModelOut, RoleOut } from '@/shared/api'
import { NavList, Panel, Toolbar } from '@/shared/ui'

import { useAgentForm } from '../model/useAgentForm'
import styles from './AgentEditor.module.scss'

interface IAgentEditorProps {
	roles: RoleOut[]
	models: Record<string, ModelOut>
	onChanged: () => Promise<void> | void
}

/**
 * Состав команды: слева агенты, справа настройки и системный промпт выбранного.
 * Имя существующего агента не редактируется — переименование завело бы вторую
 * роль с тем же промптом, а промпты лежат в файлах по имени роли.
 *
 * @param roles — агенты с бэкенда
 * @param models — реестр моделей для основного и резервного выбора
 * @param onChanged — перечитать состояние приложения после сохранения или удаления
 */
export function AgentEditor({ roles, models, onChanged }: IAgentEditorProps) {
	const { t } = useTranslation()
	const form = useAgentForm(roles, models, onChanged)

	const modelOptions = Object.entries(models).map(([id, model]) => ({
		value: id,
		label: `${id} — ${model.price_out > 0 ? t('common.perMillion', { price: model.price_out }) : t('common.free')}`
	}))

	return (
		<div className={styles.layout}>
			<NavList
				items={roles.map((role) => ({
					id: role.name,
					title: role.name,
					note: `${role.model}${role.thinking ? ` · ${t('agents.thinks')}` : ''}`
				}))}
				value={form.selected}
				onSelect={form.select}
				addLabel={t('agents.add')}
				onAdd={form.startNew}
			/>

			<Panel>
				<Form layout="vertical">
					<div className={styles.fields}>
						<Form.Item label={t('agents.name')}>
							<Input
								value={form.draft.name}
								readOnly={!form.isNew}
								onChange={(e) => form.patch('name', e.target.value)}
							/>
						</Form.Item>
						<Form.Item label={t('agents.model')}>
							<Select
								value={form.draft.model}
								onChange={(value) => form.patch('model', value)}
								options={modelOptions}
							/>
						</Form.Item>
						<Form.Item label={t('agents.fallback')} help={t('agents.fallbackHint')}>
							<Select
								value={form.draft.fallback ?? ''}
								onChange={(value) => form.patch('fallback', value || null)}
								options={[{ value: '', label: t('agents.fallbackNone') }, ...modelOptions]}
							/>
						</Form.Item>
						<Form.Item label={t('agents.maxTokens')}>
							<InputNumber
								min={256}
								max={32000}
								step={500}
								value={form.draft.max_tokens}
								onChange={(value) => form.patch('max_tokens', value ?? 6000)}
							/>
						</Form.Item>
						<Form.Item label={t('agents.temperature')}>
							<InputNumber
								min={0}
								max={2}
								step={0.1}
								value={form.draft.temperature}
								onChange={(value) => form.patch('temperature', value ?? 0.3)}
							/>
						</Form.Item>
						<Form.Item label={t('agents.thinking')}>
							<Switch
								checked={form.draft.thinking}
								onChange={(value) => form.patch('thinking', value)}
							/>
						</Form.Item>
					</div>

					<Form.Item label={t('agents.description')}>
						<Input
							value={form.draft.description}
							placeholder={t('agents.descriptionPlaceholder')}
							onChange={(e) => form.patch('description', e.target.value)}
						/>
					</Form.Item>

					<Form.Item label={t('agents.prompt')}>
						<Input.TextArea
							rows={18}
							value={form.draft.prompt}
							placeholder={t('agents.promptPlaceholder')}
							onChange={(e) => form.patch('prompt', e.target.value)}
						/>
					</Form.Item>
				</Form>

				<Toolbar status={form.status} error={form.error}>
					<Button type="primary" loading={form.busy} onClick={() => void form.save()}>
						{t('common.save')}
					</Button>
					<Button danger disabled={form.isNew || roles.length <= 1} onClick={() => void form.remove()}>
						{t('agents.deleteButton')}
					</Button>
				</Toolbar>

				<p className={styles.hint}>{t('agents.hint')}</p>
			</Panel>
		</div>
	)
}
