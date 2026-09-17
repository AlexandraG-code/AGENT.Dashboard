'use client'

import { Button, Checkbox, Form, Input, InputNumber, Modal, Select, Switch } from 'antd'
import { useTranslation } from 'react-i18next'

import type { HintOut, ModelOut, SetupOut, TeamOut } from '@/shared/api'
import { Toolbar } from '@/shared/ui'

import type { IAgentForm } from '../model/useAgentForm'
import styles from './AgentEditor.module.scss'

interface IAgentModalProps {
	form: IAgentForm
	models: Record<string, ModelOut>
	teams: TeamOut[]
	setup: SetupOut | null
	hints: HintOut[]
	canDelete: boolean
}

/**
 * Карточка агента поверх списка: настройки модели, права и системный промпт.
 * Имя существующего агента не редактируется — переименование завело бы вторую
 * роль, а назначения и статистика ссылаются на прежнее имя.
 *
 * @param form — состояние черновика и открытия модалки
 * @param models — реестр моделей для основного и резервного выбора
 * @param teams — отделы для приписки агента
 * @param setup — устройство команды: какие права можно выдать
 * @param hints — готовые куски текста для системного промпта
 * @param canDelete — можно ли удалять (последнего агента удалить нельзя)
 */
export function AgentModal({ form, models, teams, setup, hints, canDelete }: IAgentModalProps) {
	const { t } = useTranslation()

	const modelOptions = Object.entries(models).map(([id, model]) => ({
		value: id,
		label: `${id} — ${model.price_out > 0 ? t('common.perMillion', { price: model.price_out }) : t('common.free')}`
	}))

	return (
		<Modal
			open={form.open}
			onCancel={form.close}
			width={960}
			footer={null}
			destroyOnHidden
			title={form.isNew ? t('agents.newTitle') : `${form.draft.icon || '🤖'} ${form.draft.name}`}
		>
			<Form layout="vertical">
				<div className={styles.fields}>
					<Form.Item label={t('agents.name')}>
						<Input
							value={form.draft.name}
							readOnly={!form.isNew}
							onChange={(e) => form.patch('name', e.target.value)}
						/>
					</Form.Item>
					<Form.Item label={t('agents.team')} help={t('agents.teamHint')}>
						<Select
							value={form.draft.team}
							onChange={(value: string) => form.patch('team', value)}
							options={[
								{ value: '', label: t('agents.noTeam') },
								...teams.map((item) => ({ value: item.name, label: item.title || item.name }))
							]}
						/>
					</Form.Item>
					<Form.Item label={t('agents.icon')} help={t('agents.iconHint')}>
						<Input
							value={form.draft.icon}
							maxLength={4}
							onChange={(e) => form.patch('icon', e.target.value)}
						/>
					</Form.Item>
					<Form.Item label={t('agents.tools')} help={t('agents.toolsHint')} className={styles.wide}>
						<Checkbox.Group
							value={form.draft.tools}
							options={(setup?.tools ?? []).map((tool) => ({ value: tool.key, label: tool.title }))}
							onChange={(value) => form.patch('tools', value as string[])}
						/>
					</Form.Item>
					<Form.Item label={t('agents.lead')} help={t('agents.leadHint')}>
						<Switch checked={form.draft.lead} onChange={(value) => form.patch('lead', value)} />
					</Form.Item>
					<Form.Item label={t('agents.external')} help={t('agents.externalHint')}>
						<Switch checked={form.draft.external} onChange={(value) => form.patch('external', value)} />
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
						<Switch checked={form.draft.thinking} onChange={(value) => form.patch('thinking', value)} />
					</Form.Item>
				</div>

				<Form.Item label={t('agents.description')}>
					<Input
						value={form.draft.description}
						placeholder={t('agents.descriptionPlaceholder')}
						onChange={(e) => form.patch('description', e.target.value)}
					/>
				</Form.Item>

				<Form.Item label={t('agents.prompt')} help={t('agents.hintsHint')}>
					<div className={styles.hints}>
						{hints.map((hint) => (
							<Button
								key={hint.key}
								size="small"
								onClick={() =>
									form.patch(
										'prompt',
										form.draft.prompt.trimEnd() === ''
											? hint.text
											: `${form.draft.prompt.trimEnd()}\n\n${hint.text}`
									)
								}
							>
								+ {hint.title || hint.key}
							</Button>
						))}
					</div>
					<Input.TextArea
						rows={14}
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
				<Button danger disabled={form.isNew || !canDelete} onClick={() => void form.remove()}>
					{t('agents.deleteButton')}
				</Button>
			</Toolbar>

			<p className={styles.hint}>{t('agents.hint')}</p>
		</Modal>
	)
}
