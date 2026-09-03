import clsx from 'clsx'

import styles from './Toolbar.module.scss'

interface IToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
	status?: string
	error?: string
}

/**
 * Ряд управления под формой: кнопки в строку плюс сообщение о результате.
 *
 * @param status — сообщение об успехе, показывается зелёным
 * @param error — сообщение об ошибке, показывается красным и имеет приоритет
 * @param children — сами кнопки и переключатели
 */
export function Toolbar({ status, error, className, children, ...props }: IToolbarProps) {
	return (
		<div className={clsx(styles.toolbar, className)} {...props}>
			{children}
			{(error || status) && (
				<span className={clsx(styles.message, error ? styles.error : styles.success)}>{error || status}</span>
			)}
		</div>
	)
}
