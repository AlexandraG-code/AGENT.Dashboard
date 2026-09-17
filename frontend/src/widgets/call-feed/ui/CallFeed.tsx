'use client'

import { Input, Segmented, Spin, Tag } from 'antd'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import type { EventOut } from '@/shared/api'
import { money, timeOnly, tokens } from '@/shared/lib/format'

import { useCallFeed, type Period } from '../model/useCallFeed'
import styles from './CallFeed.module.scss'

interface ICallFeedProps {
	onSelect: (callId: string) => void
}

/**
 * Живой журнал команды: время, роль, модель, задача, токены и цена.
 *
 * В колонке модели стоит модель и только она: у служебных событий (импорт
 * правил, сохранение агента) модели нет, и раньше туда подставлялось
 * пространство — из-за чего проект читался как название модели.
 * Строка вызова кликабельна и открывает разбор — там видно, что именно ушло
 * в модель и что она ответила.
 *
 * Показывается история за выбранный период плюс живой хвост; длинный журнал
 * прокручивается внутри панели, а не растягивает страницу.
 *
 * @param onSelect — открыть разбор вызова по его идентификатору
 */
export function CallFeed({ onSelect }: ICallFeedProps) {
	const { t } = useTranslation()
	const feed = useCallFeed()
	const { events, error } = feed

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
					<Tag>{isCall ? (event.role ?? '—') : t(`feed.events.${event.event}`, { defaultValue: event.event })}</Tag>
				)}
				<span className={styles.dim}>{event.model ?? ''}</span>
				<span className={clsx(styles.task, isError && styles.error)}>
					{isError
						? (event.error ?? '')
						: isCall
							? (event.task ?? '')
							: (event.name ?? event.topic ?? event.query ?? event.role ?? event.project ?? '')}
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
		<div className={styles.wrap}>
			<div className={styles.filters}>
				<Segmented<Period>
					value={feed.period}
					onChange={feed.setPeriod}
					options={[
						{ value: 'hour', label: t('feed.periodHour') },
						{ value: 'day', label: t('feed.periodDay') },
						{ value: 'week', label: t('feed.periodWeek') },
						{ value: 'month', label: t('feed.periodMonth') },
						{ value: 'all', label: t('feed.periodAll') }
					]}
				/>
				<Input.Search
					className={styles.search}
					value={feed.query}
					allowClear
					placeholder={t('feed.searchPlaceholder')}
					onChange={(e) => feed.setQuery(e.target.value)}
				/>
				<span className={styles.count}>{t('feed.shown', { shown: events.length, total: feed.total })}</span>
			</div>

			<div className={styles.feed}>
				<div className={clsx(styles.row, styles.head)}>
					<span>{t('feed.time')}</span>
					<span>{t('common.role')}</span>
					<span>{t('common.model')}</span>
					<span>{t('feed.task')}</span>
					<span className={styles.right}>{t('common.tokens')}</span>
					<span className={styles.right}>$</span>
				</div>
				<div className={styles.scroll}>
					{error && <div className={clsx(styles.row, styles.dim)}>{error}</div>}
					{feed.loading ? (
						<Spin description={t('app.loading')} />
					) : (
						events.map(renderRow)
					)}
					{!feed.loading && events.length === 0 && (
						<div className={clsx(styles.row, styles.dim)}>{t('feed.empty')}</div>
					)}
				</div>
			</div>
		</div>
	)
}
