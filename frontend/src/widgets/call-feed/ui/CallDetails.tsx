'use client'

import { Alert, Drawer, Spin } from 'antd'
import { useTranslation } from 'react-i18next'

import type { MessageOut } from '@/shared/api'
import { duration, money, tokens } from '@/shared/lib/format'

import { useCall } from '../model/useCall'
import styles from './CallDetails.module.scss'

interface ICallDetailsProps {
	callId: string | null
	onClose: () => void
}

/** Содержимое сообщения бывает строкой либо частями мультимодального запроса. */
function messageText(message: MessageOut): string {
	if (typeof message.content === 'string') return message.content
	if (Array.isArray(message.content)) return message.content.map((part) => JSON.stringify(part, null, 2)).join('\n')
	return ''
}

/**
 * Разбор одного вызова: что ушло в модель, о чём она думала и что ответила.
 *
 * @param callId — идентификатор вызова; null закрывает панель
 * @param onClose — закрыть панель
 */
export function CallDetails({ callId, onClose }: ICallDetailsProps) {
	const { t } = useTranslation()
	const { call, loading, error } = useCall(callId)

	return (
		<Drawer open={callId !== null} onClose={onClose} title={t('feed.details')} size="large" destroyOnHidden>
			{loading && <Spin />}
			{error && <Alert type="error" message={t('feed.failed', { error })} />}
			{call && (
				<>
					<div className={styles.meta}>
						<span>{call.role}</span>
						<span>{call.model}</span>
						{call.project && <span>{call.project}</span>}
						<span>{money(call.cost)}</span>
						<span>{duration(call.seconds)}</span>
						<span>
							{tokens(call.tokens_in)}→{tokens(call.tokens_out)}
						</span>
						{call.tokens_cached > 0 && (
							<span>
								{t('common.cached')} {tokens(call.tokens_cached)}
							</span>
						)}
						{call.tokens_reasoning > 0 && (
							<span>
								{t('common.reasoning')} {tokens(call.tokens_reasoning)}
							</span>
						)}
					</div>

					<div className={styles.section}>
						<p className={styles.caption}>{t('feed.prompt')}</p>
						{call.messages.map((message, index) => (
							<div key={index}>
								<p className={styles.role}>{message.role}</p>
								<pre className={styles.block}>{messageText(message)}</pre>
							</div>
						))}
					</div>

					{call.reasoning && (
						<div className={styles.section}>
							<p className={styles.caption}>{t('feed.reasoning')}</p>
							<pre className={styles.block}>{call.reasoning}</pre>
						</div>
					)}

					<div className={styles.section}>
						<p className={styles.caption}>{t('feed.answer')}</p>
						<pre className={styles.block}>{call.text}</pre>
					</div>
				</>
			)}
		</Drawer>
	)
}
