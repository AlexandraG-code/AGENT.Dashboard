'use client'

import clsx from 'clsx'

import styles from './NavList.module.scss'

export interface INavItem {
	id: string
	title: string
	note?: string
}

interface INavListProps {
	items: INavItem[]
	value: string | null
	onSelect: (id: string) => void
	addLabel?: string
	onAdd?: () => void
	emptyLabel?: string
}

/**
 * Список выбора слева от формы: агенты, пространства, заметки.
 *
 * @param items — пункты списка: идентификатор, заголовок и мелкая приписка
 * @param value — идентификатор выбранного пункта; null, когда открыт черновик нового
 * @param onSelect — выбор пункта
 * @param addLabel — подпись кнопки создания; без неё кнопка не показывается
 * @param onAdd — начать создание нового
 * @param emptyLabel — что написать, когда список пуст
 */
export function NavList({ items, value, onSelect, addLabel, onAdd, emptyLabel }: INavListProps) {
	return (
		<nav className={styles.list}>
			{items.map((item) => (
				<button
					key={item.id}
					type="button"
					onClick={() => onSelect(item.id)}
					className={clsx(styles.item, value === item.id && styles.active)}
				>
					<span className={styles.title}>{item.title}</span>
					{item.note && <span className={styles.note}>{item.note}</span>}
				</button>
			))}
			{items.length === 0 && emptyLabel && <p className={styles.empty}>{emptyLabel}</p>}
			{addLabel && onAdd && (
				<button type="button" onClick={onAdd} className={clsx(styles.item, styles.add)}>
					{addLabel}
				</button>
			)}
		</nav>
	)
}
