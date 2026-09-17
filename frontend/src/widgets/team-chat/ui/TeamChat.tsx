'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.

import { Button, Input } from 'antd'
import clsx from 'clsx'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { RoleOut } from '@/shared/api'
import { Panel } from '@/shared/ui'

import { applyMention, matchRoles, mentionQuery } from '../lib/mentions'
import { useTeamChat } from '../model/useTeamChat'
import styles from './TeamChat.module.scss'

interface ITeamChatProps {
	project: string
	roles: RoleOut[]
}

/**
 * Общий чат команды: человек, главный и агенты в одной ленте.
 * Enter отправляет, Shift+Enter переносит строку; «@» открывает список агентов,
 * которых можно позвать — упомянутый отвечает в ту же ленту.
 *
 * @param project — пространство, чью ленту показываем
 * @param roles — роли агентов: их значки и имена для упоминаний
 */
export function TeamChat({ project, roles }: ITeamChatProps) {
	const { t } = useTranslation()
	const chat = useTeamChat(project)
	const [caret, setCaret] = useState(0)

	const query = mentionQuery(chat.draft, caret)
	const suggestions =
		query === null
			? []
			: matchRoles(
					roles.map((role) => role.name),
					query
				)

	const pickIcon = (author: string): string => {
		if (author === 'human') return '🧑'
		const icon = roles.find((role) => role.name === author)?.icon
		return icon || '🤖'
	}

	return (
		<Panel title={t('chat.title')} subtitle={t('chat.subtitle')}>
			<div className={styles.feed}>
				{chat.messages.length === 0 && <p className={styles.empty}>{t('chat.empty')}</p>}
				{chat.messages.map((message, index) => (
					<article
						key={`${message.ts}-${index}`}
						className={clsx(
							styles.message,
							message.author === 'human' && styles.human,
							message.author === 'architect' && styles.architect,
							message.author !== 'human' && message.author !== 'architect' && styles.agent
						)}
					>
						<header className={styles.head}>
							<span className={styles.icon}>{pickIcon(message.author)}</span>
							<b>{message.author}</b>
							{message.model !== '' && <span className={styles.model}>{message.model}</span>}
							<time className={styles.time}>
								{new Date(message.ts * 1000).toLocaleTimeString('ru-RU')}
							</time>
						</header>
						<p className={styles.text}>{message.text}</p>
					</article>
				))}
			</div>

			<p className={styles.hint}>
				{t('chat.mentionHint', { roles: roles.map((role) => `@${role.name}`).join(', ') })}
			</p>

			<div className={styles.compose}>
				{suggestions.length > 0 && (
					<div className={styles.mentions}>
						{suggestions.map((name) => (
							<button
								type="button"
								key={name}
								className={styles.mention}
								onClick={() => {
									const next = applyMention(chat.draft, caret, name)
									chat.setDraft(next.text)
									setCaret(next.caret)
								}}
							>
								<span className={styles.icon}>{pickIcon(name)}</span>
								{name}
							</button>
						))}
					</div>
				)}
				<Input.TextArea
					rows={2}
					value={chat.draft}
					placeholder={t('chat.placeholder')}
					onChange={(e) => {
						chat.setDraft(e.target.value)
						setCaret(e.target.selectionStart ?? 0)
					}}
					onPressEnter={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
						// Enter отправляет, Shift+Enter переносит строку — как в мессенджерах.
						if (!e.shiftKey) {
							e.preventDefault()
							void chat.send()
						}
					}}
				/>
				<Button type="primary" loading={chat.sending} onClick={() => void chat.send()}>
					{t('chat.send')}
				</Button>
			</div>
		</Panel>
	)
}
