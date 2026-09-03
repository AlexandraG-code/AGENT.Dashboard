'use client'

import { Tag } from 'antd'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import type { EventOut } from '@/shared/api'
import { money, timeOnly, tokens } from '@/shared/lib/format'

import { useCallFeed } from '../model/useCallFeed'
import styles from './CallFeed.module.scss'

interface ICallFeedProps {
	onSelect: (callId: string) => void
}

/**
 * Живая лента вызовов флота: время, роль, модель, задача, токены и цена.
 * Строка вызова кликабельна и открывает разбор — там видно, что именно ушло
 * в модель и что она ответила.
 *
 * @param onSelect — открыть разбор вызова по его идентификатору
 */
export function CallFeed({ onSelect }: ICallFeedProps) {
	const { t } = useTranslation()
	const { events, error } = useCallFeed()

	const renderRow = (event: EventOut, index: number) => {
		const isCall = event.event === 'call'
		const isError = event.event === 'error'
		const clickable = isCall && Boolean(event.id)
		const free = (event.cost ?? 0) === 0

		const content = (
			<>
				<span className={styles.dim}>{timeOnly(event.ts)}</span>
				{isError ? (
					<Tag color="error">{t('feed.error')}</Tag>
				) : (
					<Tag>{isCall ? (event.role ?? '—') : event.event}</Tag>
				)}
				<span className={styles.dim}>{event.model ?? event.project ?? ''}</span>
				<span className={clsx(styles.task, isError && styles.error)}>
					{isError
						? (event.error ?? '')
						: isCall
							? (event.task ?? '')
							: (event.name ?? event.topic ?? event.query ?? event.role ?? '')}
				</span>
				<span className={clsx(styles.right, styles.dim)}>
					{isCall ? `${tokens(event.tokens_in ?? 0)}→${tokens(event.tokens_out ?? 0)}` : ''}
				</span>
				<span className={clsx(styles.right, free && styles.free)}>
					{isCall ? (free ? '0' : money(event.cost ?? 0)) : ''}
				</span>
			</>
		)

		return clickable ? (
			<button
				key={`${event.ts}-${index}`}
				type="button"
				className={clsx(styles.row, styles.clickable)}
				onClick={() => onSelect(event.id as string)}
			>
				{content}
			</button>
		) : (
			<div key={`${event.ts}-${index}`} className={styles.row}>
				{content}
			</div>
		)
	}

	return (
		<div className={styles.feed}>
			<div className={clsx(styles.row, styles.head)}>
				<span>{t('feed.time')}</span>
				<span>{t('common.role')}</span>
				<span>{t('common.model')}</span>
				<span>{t('feed.task')}</span>
				<span className={styles.right}>{t('common.tokens')}</span>
				<span className={styles.right}>$</span>
			</div>
			{error && <div className={clsx(styles.row, styles.dim)}>{error}</div>}
			{events.map(renderRow)}
		</div>
	)
}
