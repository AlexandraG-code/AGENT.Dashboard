'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fleetApi } from '@/shared/api'
import { duration, money, tokens } from '@/shared/lib/format'
import { useAction } from '@/shared/lib/useAction'

export type RunMode = 'run' | 'council'

/**
 * Запуск задачи из интерфейса: один агент или совет. Держит поля формы, результат
 * и строку с ценой вызова — компоненту остаётся разметка.
 *
 * @param project — пространство, контекст которого подмешает бэкенд
 */
export function useRunTask(project: string) {
	const { t } = useTranslation()
	const [role, setRole] = useState('')
	const [mode, setMode] = useState<RunMode>('run')
	const [task, setTask] = useState('')
	const [extra, setExtra] = useState('')
	const [output, setOutput] = useState('')
	const [meta, setMeta] = useState('')

	const start = async () => {
		setOutput('')
		setMeta('')

		if (mode === 'council') {
			const result = await fleetApi.council({ role, task, project, extra })
			setOutput(result.transcript.map((turn) => `### ${turn.speaker} (${turn.model})\n${turn.text}`).join('\n\n'))
			setMeta(t('run.councilMeta', { turns: result.transcript.length, cost: money(result.cost) }))
			return
		}

		const result = await fleetApi.run({ role, task, project, extra })
		setOutput(result.text)
		setMeta(
			t('run.runMeta', {
				model: result.model,
				in: tokens(result.tokens_in),
				out: tokens(result.tokens_out),
				cost: money(result.cost),
				duration: duration(result.seconds)
			})
		)
	}

	const action = useAction(start)

	return {
		role,
		setRole,
		mode,
		setMode,
		task,
		setTask,
		extra,
		setExtra,
		output: action.error ? action.error : output,
		meta,
		busy: action.busy,
		run: action.run
	}
}
