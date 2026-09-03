'use client'

import { Button, Form, Input, Select, Switch } from 'antd'
import { useTranslation } from 'react-i18next'

import type { ProviderOut } from '@/shared/api'
import { Panel, Toolbar } from '@/shared/ui'

import { PROVIDER_PRESETS } from '../lib/presets'
import { useProviderForm } from '../model/useProviderForm'
import { CheckResult } from './CheckResult'
import { RegistryList } from './RegistryList'
import styles from './Registry.module.scss'

interface IProviderRegistryProps {
	providers: ProviderOut[]
	onChanged: () => Promise<void> | void
}

/**
 * Реестр провайдеров: куда ходить за моделями и чем авторизоваться.
 * Ключ хранится на бэкенде и наружу не отдаётся, поэтому в форме он всегда пуст,
 * а пустое поле при сохранении означает «оставить прежний».
 *
 * @param providers — заведённые провайдеры с признаком «ключ задан»
 * @param onChanged — перечитать состояние приложения после изменения
 */
export function ProviderRegistry({ providers, onChanged }: IProviderRegistryProps) {
	const { t } = useTranslation()
	const form = useProviderForm(onChanged)

	return (
		<Panel title={t('providers.title')} subtitle={t('providers.subtitle')}>
			<div className={styles.presets}>
				{PROVIDER_PRESETS.map((preset) => (
					<Button
						key={preset.id}
						size="small"
						title={t(preset.hintKey)}
						onClick={() => form.applyPreset(preset.draft)}
					>
						+ {t(preset.labelKey)}
					</Button>
				))}
			</div>

			<RegistryList
				rows={providers.map((provider) => ({
					id: provider.name,
					title: provider.title,
					notes: [provider.base_url],
					right: provider.auth,
					mark: {
						text: provider.has_key ? t('providers.hasKey') : t('providers.noKey'),
						ok: Boolean(provider.has_key)
					}
				}))}
				value={form.selected}
				onSelect={(name) => {
					const found = providers.find((item) => item.name === name)
					if (found) form.edit(found)
				}}
			/>

			<Form layout="vertical">
				<div className={styles.fields}>
					<Form.Item label={t('providers.name')} help={t('providers.nameHint')}>
						<Input value={form.draft.name} onChange={(e) => form.patch('name', e.target.value)} />
					</Form.Item>
					<Form.Item label={t('providers.label')}>
						<Input value={form.draft.title} onChange={(e) => form.patch('title', e.target.value)} />
					</Form.Item>
					<Form.Item label={t('providers.baseUrl')} help={t('providers.baseUrlHint')}>
						<Input
							value={form.draft.base_url}
							placeholder="https://api.example.com/v1"
							onChange={(e) => form.patch('base_url', e.target.value)}
						/>
					</Form.Item>
					<Form.Item label={t('providers.auth')}>
						<Select
							value={form.draft.auth}
							onChange={(value) => form.patch('auth', value)}
							options={[
								{ value: 'bearer', label: t('providers.authBearer') },
								{ value: 'api-key', label: t('providers.authApiKey') },
								{ value: 'gigachat', label: t('providers.authGigachat') }
							]}
						/>
					</Form.Item>
					<Form.Item
						label={t('providers.key')}
						help={form.selected ? t('providers.keyHintEdit') : t('providers.keyHintNew')}
					>
						<Input.Password
							value={form.draft.api_key}
							autoComplete="off"
							onChange={(e) => form.patch('api_key', e.target.value)}
						/>
					</Form.Item>
					<Form.Item label={t('providers.keyEnv')} help={t('providers.keyEnvHint')}>
						<Input
							value={form.draft.key_env}
							placeholder="YANDEX_API_KEY"
							onChange={(e) => form.patch('key_env', e.target.value)}
						/>
					</Form.Item>
				</div>

				<div className={styles.switches}>
					<label className={styles.switch}>
						<Switch
							checked={form.draft.verify_ssl}
							onChange={(value) => form.patch('verify_ssl', value)}
						/>
						{t('providers.verifySsl')}
					</label>
					<label className={styles.switch}>
						<Switch
							checked={form.draft.send_thinking}
							onChange={(value) => form.patch('send_thinking', value)}
						/>
						{t('providers.sendThinking')}
					</label>
				</div>
			</Form>

			<Toolbar status={form.status} error={form.error}>
				<Button
					type="primary"
					loading={form.busy}
					disabled={form.draft.name.trim() === '' || form.draft.base_url.trim() === ''}
					onClick={() => void form.save()}
				>
					{t('providers.saveButton')}
				</Button>
				<Button disabled={form.busy} onClick={() => void form.probe()}>
					{t('providers.checkButton')}
				</Button>
				<Button danger disabled={form.selected === null} onClick={() => void form.remove()}>
					{t('common.delete')}
				</Button>
			</Toolbar>

			<CheckResult text={form.check} />
			<p className={styles.hint}>{t('providers.checkHint')}</p>
		</Panel>
	)
}
