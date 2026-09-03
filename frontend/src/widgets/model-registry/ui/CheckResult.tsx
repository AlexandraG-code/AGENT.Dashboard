import clsx from 'clsx'

import styles from './CheckResult.module.scss'

interface ICheckResultProps {
	text: string
}

/**
 * Ответ провайдера на проверку связи — как есть, вместе с кодом HTTP.
 * «Что-то пошло не так» бесполезно тому, кто настраивает подключение.
 *
 * @param text — строка результата; начинается с ✓ при успехе
 */
export function CheckResult({ text }: ICheckResultProps) {
	if (!text) return null
	return <p className={clsx(styles.result, text.startsWith('✓') ? styles.ok : styles.fail)}>{text}</p>
}
