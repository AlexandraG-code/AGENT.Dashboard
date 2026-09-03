import clsx from 'clsx'

import styles from './Panel.module.scss'

interface IPanelProps extends React.HTMLAttributes<HTMLElement> {
	title?: string
	subtitle?: string
	tools?: React.ReactNode
}

/**
 * Стеклянная панель — основной контейнер интерфейса.
 *
 * @param title — заголовок панели, необязателен
 * @param subtitle — пояснение под заголовком: зачем этот блок и что в нём видно
 * @param tools — управление в правом верхнем углу (кнопки, переключатели)
 * @param children — содержимое панели
 */
export function Panel({ title, subtitle, tools, className, children, ...props }: IPanelProps) {
	return (
		<section className={clsx(styles.panel, className)} {...props}>
			{(title || tools) && (
				<div className={styles.head}>
					{title && <h3 className={styles.title}>{title}</h3>}
					{subtitle && <p className={styles.subtitle}>{subtitle}</p>}
					{tools && <div className={styles.tools}>{tools}</div>}
				</div>
			)}
			{children}
		</section>
	)
}
