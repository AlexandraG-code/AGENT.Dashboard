'use client'

import { Button, Form, Input, InputNumber, Select, Switch } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ModelOut, ProviderOut } from '@/shared/api'
import { Panel, Toolbar } from '@/shared/ui'

import { CLAUDE_MODEL_PRESETS } from '../lib/presets'
import { useModelCatalog } from '../model/useModelCatalog'
import { useModelForm } from '../model/useModelForm'
import { CatalogTable } from './CatalogTable'
import { CheckResult } from './CheckResult'
import { RegistryList } from './RegistryList'
import styles from './Registry.module.scss'

interface IModelRegistryProps {
	models: Record<string, ModelOut>
	providers: ProviderOut[]
	onChanged: () => Promise<void> | void
}

/**
 * Реестр моделей: что можно выбрать агенту и почём это считается.
 * Цены нужны только для отчёта о расходах — считает их дашборд, а не провайдер,
 * поэтому у подписочных моделей они нулевые и вызовы честно показываются бесплатными.
 *
 * @param models — заведённые модели
 * @param providers — провайдеры для выбора принадлежности
 * @param onChanged — перечитать состояние приложения после изменения
 */
export function ModelRegistry({ models, providers, onChanged }: IModelRegistryProps) {
	const { t } = useTranslation()
	const form = useModelForm(providers[0]?.name ?? '', onChanged)
	const catalog = useModelCatalog()
	// Заготовки моделей Claude показываются только когда есть куда их вешать.
	const claude = providers.find((provider) => provider.auth === 'anthropic')

	return (
		<Panel title={t('models.title')} subtitle={t('models.subtitle')}>
			<div className={styles.presets}>
				<Button size="small" onClick={form.startNew}>
					+ {t('models.add')}
				</Button>
				{claude !== undefined &&
					CLAUDE_MODEL_PRESETS.map((preset) => (
						<Button
							key={preset.id}
							size="small"
							title={t('models.presetClaudeHint')}
							onClick={() => form.applyPreset(preset, claude.name)}
						>
							+ {preset.title}
						</Button>
					))}
			</div>

			<Toolbar status={catalog.busy ? t('models.catalogLoading') : ''} error={catalog.error}>
				<Button
					size="small"
					loading={catalog.busy}
					disabled={form.draft.provider === ''}
					onClick={() => catalog.load(form.draft.provider)}
				>
					{t('models.catalogButton', { provider: form.draft.provider || '—' })}
				</Button>
				<span className={styles.hint}>{t('models.catalogHint')}</span>
			</Toolbar>

			{catalog.models.length > 0 && (
				<CatalogTable
					models={catalog.models}
					onPick={(id) => form.useCatalogModel(id, catalog.provider)}
				/>
			)}

			<RegistryList
				rows={Object.values(models).map((model) => ({
					id: model.id ?? '',
					title: model.id ?? '',
					notes: model.vision ? [model.provider, t('providers.vision')] : [model.provider],
					right: t('models.rowSummary', {
						price:
							(model.price_out ?? 0) > 0
								? t('common.perMillion', { price: model.price_out })
								: (model.plan ?? '') || t('common.priceUnknown'),
						concurrency: model.concurrency
					})
				}))}
				value={form.selected}
				onSelect={(id) => {
					const found = models[id]
					if (found) form.edit(found)
				}}
			/>

			<Form layout="vertical">
				<div className={styles.fields}>
					<Form.Item label={t('models.id')} help={t('models.idHint')}>
						<Input
							value={form.draft.id}
							readOnly={form.selected !== null}
							onChange={(e) => form.patch('id', e.target.value)}
						/>
					</Form.Item>
					<Form.Item label={t('models.provider')} help={t('models.providerHint')}>
						<Select
							value={form.draft.provider}
							onChange={(value) => {
								form.patch('provider', value)
								catalog.clear()
							}}
							options={providers.map((provider) => ({ value: provider.name, label: provider.title }))}
						/>
					</Form.Item>
					<Form.Item label={t('models.label')}>
						<Input value={form.draft.title} onChange={(e) => form.patch('title', e.target.value)} />
					</Form.Item>
					<Form.Item label={t('models.priceIn')} help={t('models.priceInHint')}>
						<InputNumber
							min={0}
							step={0.001}
							value={form.draft.price_in}
							onChange={(value) => form.patch('price_in', value ?? 0)}
						/>
					</Form.Item>
					<Form.Item label={t('models.priceCached')}>
						<InputNumber
							min={0}
							step={0.001}
							value={form.draft.price_in_cached}
							onChange={(value) => form.patch('price_in_cached', value ?? 0)}
						/>
					</Form.Item>
					<Form.Item label={t('models.priceOut')}>
						<InputNumber
							min={0}
							step={0.001}
							value={form.draft.price_out}
							onChange={(value) => form.patch('price_out', value ?? 0)}
						/>
					</Form.Item>
					<Form.Item label={t('models.concurrency')} help={t('models.concurrencyHint')}>
						<InputNumber
							min={1}
							max={100}
							value={form.draft.concurrency}
							onChange={(value) => form.patch('concurrency', value ?? 3)}
						/>
					</Form.Item>
					<Form.Item label={t('models.plan')} help={t('models.planHint')} className={styles.wide}>
						<Input
							value={form.draft.plan}
							placeholder={t('models.planPlaceholder')}
							onChange={(e) => form.patch('plan', e.target.value)}
						/>
					</Form.Item>
					<Form.Item label={t('models.vision')}>
						<Switch checked={form.draft.vision} onChange={(value) => form.patch('vision', value)} />
					</Form.Item>
				</div>
			</Form>

			<Toolbar status={form.status} error={form.error}>
				<Button
					type="primary"
					loading={form.busy}
					disabled={form.draft.id.trim() === '' || form.draft.provider === ''}
					onClick={() => void form.save()}
				>
					{t('models.saveButton')}
				</Button>
				<Button disabled={form.busy || form.draft.id.trim() === ''} onClick={() => void form.probe()}>
					{t('models.checkButton')}
				</Button>
				<Button danger disabled={form.selected === null} onClick={() => void form.remove()}>
					{t('common.delete')}
				</Button>
			</Toolbar>

			<CheckResult text={form.check} />
			<p className={styles.hint}>{t('models.priceNote')}</p>
		</Panel>
	)
}
