'use client'

import { useCallback, useState } from 'react'

interface ActionState {
	busy: boolean
	error: string
	status: string
}

interface Action<A extends unknown[]> extends ActionState {
	run: (...args: A) => Promise<void>
	setStatus: (text: string) => void
	reset: () => void
}

/**
 * Обёртка над асинхронным действием формы: сама держит признак «идёт запрос»,
 * текст ошибки и сообщение об успехе. Написана один раз, потому что иначе этот
 * `try/catch/finally` копируется в каждый виджет и в каждом расходится.
 *
 * @param fn — само действие; его результат не используется
 * @param successText — что показать после удачного выполнения (гаснет через 2 секунды)
 */
export function useAction<A extends unknown[]>(
	fn: (...args: A) => Promise<unknown>,
	successText = ''
): Action<A> {
	const [state, setState] = useState<ActionState>({ busy: false, error: '', status: '' })

	const run = useCallback(
		async (...args: A) => {
			setState({ busy: true, error: '', status: '' })
			try {
				await fn(...args)
				setState({ busy: false, error: '', status: successText })
				if (successText) {
					setTimeout(() => setState((prev) => ({ ...prev, status: '' })), 2000)
				}
			} catch (error) {
				setState({
					busy: false,
					status: '',
					error: error instanceof Error ? error.message : String(error)
				})
			}
		},
		[fn, successText]
	)

	return {
		...state,
		run,
		setStatus: (text: string) => setState((prev) => ({ ...prev, status: text })),
		reset: () => setState({ busy: false, error: '', status: '' })
	}
}
