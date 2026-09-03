import styles from './SeriesDot.module.scss'

interface ISeriesDotProps {
	color: string
}

/**
 * Метка серии рядом с текстом: идентичность не должна держаться на одном цвете,
 * поэтому точка всегда стоит вместе с подписью.
 *
 * @param color — цвет серии из палитры графиков
 */
export function SeriesDot({ color }: ISeriesDotProps) {
	// Цвет приходит из данных, поэтому передаётся переменной — само оформление в модуле.
	return <span aria-hidden className={styles.dot} style={{ '--dot-color': color } as React.CSSProperties} />
}
