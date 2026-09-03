import clsx from 'clsx'

import styles from './KeyValues.module.scss'

export interface IKeyValue {
	key: string
	label: string
	value: string
	tone?: 'normal' | 'good' | 'dim'
}

interface IKeyValuesProps {
	items: IKeyValue[]
	minWidth?: number
}

/**
 * Ряд «подпись — значение»: сводка чисел под заголовком панели.
 *
 * @param items — пары подпись/значение с необязательной окраской
 * @param minWidth — минимальная ширина колонки в пикселях, от неё считается сетка
 */
export function KeyValues({ items, minWidth = 130 }: IKeyValuesProps) {
	return (
		<dl className={styles.list} style={{ '--kv-min': `${minWidth}px` } as React.CSSProperties}>
			{items.map((item) => (
				<div key={item.key}>
					<dt className={styles.term}>{item.label}</dt>
					<dd className={clsx(styles.value, item.tone && item.tone !== 'normal' && styles[item.tone])}>
						{item.value}
					</dd>
				</div>
			))}
		</dl>
	)
}
