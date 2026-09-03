'use client'

import clsx from 'clsx'

import styles from './RegistryList.module.scss'

export interface IRegistryRow {
	id: string
	title: string
	notes?: string[]
	right?: string
	mark?: { text: string; ok: boolean }
}

interface IRegistryListProps {
	rows: IRegistryRow[]
	value: string | null
	onSelect: (id: string) => void
}

/**
 * Список записей реестра — им показываются и провайдеры, и модели: строка
 * с идентификатором, пояснениями, правой колонкой и цветной пометкой.
 *
 * @param rows — строки списка
 * @param value — идентификатор выбранной строки
 * @param onSelect — выбор строки для правки
 */
export function RegistryList({ rows, value, onSelect }: IRegistryListProps) {
	return (
		<ul className={styles.list}>
			{rows.map((row) => (
				<li key={row.id}>
					<button
						type="button"
						onClick={() => onSelect(row.id)}
						className={clsx(styles.row, value === row.id && styles.active)}
					>
						<span className={styles.title}>{row.title}</span>
						{row.notes?.map((note) => (
							<span key={note} className={styles.note}>
								{note}
							</span>
						))}
						{row.right && <span className={styles.right}>{row.right}</span>}
						{row.mark && (
							<span className={clsx(styles.right, row.mark.ok ? styles.ok : styles.warn)}>
								{row.mark.text}
							</span>
						)}
					</button>
				</li>
			))}
		</ul>
	)
}
