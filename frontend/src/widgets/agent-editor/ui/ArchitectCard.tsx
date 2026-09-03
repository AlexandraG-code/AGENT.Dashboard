'use client'

import { useTranslation } from 'react-i18next'

import type { ClaudeStat } from '@/shared/api'
import { tokens } from '@/shared/lib/format'
import { Panel } from '@/shared/ui'

import styles from './ArchitectCard.module.scss'

interface IArchitectCardProps {
	claude?: ClaudeStat
}

/**
 * Claude Code в составе команды. Он не ходит через флот и его настройки живут не
 * здесь, но без него состав команды не читается, поэтому показан отдельной карточкой.
 *
 * @param claude — сводка по его сессиям; без неё карточка покажет только описание
 */
export function ArchitectCard({ claude }: IArchitectCardProps) {
	const { t } = useTranslation()
	const models = Object.keys(claude?.models ?? {}).join(', ')

	return (
		<Panel>
			<div className={styles.head}>
				<h3>{t('claude.title')}</h3>
				<span className={styles.model}>{models || 'claude'}</span>
				<span className={styles.badge}>{t('claude.external')}</span>
			</div>
			<p className={styles.about}>{t('claude.about')}</p>
			{claude?.available && (
				<p className={styles.usage}>
					{t('claude.usage', {
						calls: claude.total.calls,
						in: tokens(claude.total.tokens_in),
						out: tokens(claude.total.tokens_out)
					})}
				</p>
			)}
		</Panel>
	)
}
