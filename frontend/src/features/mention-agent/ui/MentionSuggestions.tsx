// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора.
'use client'

import type { IMentionAgent } from '../model/useMentions'
import styles from './MentionSuggestions.module.scss'

interface IMentionSuggestionsProps {
	agents: IMentionAgent[]
	onPick: (name: string) => void
}

/**
 * Список агентов, которых можно позвать — открывается над полем ввода,
 * пока после «@» набирается имя.
 *
 * @param agents — подходящие по набранному тексту агенты
 * @param onPick — выбрать агента и подставить его имя в черновик
 */
export function MentionSuggestions({ agents, onPick }: IMentionSuggestionsProps) {
	if (agents.length === 0) return null

	return (
		<div className={styles.mentions}>
			{agents.map((agent) => (
				<button type="button" key={agent.name} className={styles.mention} onClick={() => onPick(agent.name)}>
					<span className={styles.icon}>{agent.icon}</span>
					{agent.label}
					{agent.label !== agent.name && <span className={styles.model}>@{agent.name}</span>}
				</button>
			))}
		</div>
	)
}
