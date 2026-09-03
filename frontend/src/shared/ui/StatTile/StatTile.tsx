import clsx from 'clsx'

import styles from './StatTile.module.scss'

type Tone = 'neutral' | 'good' | 'warn' | 'bad'

interface IStatTileProps {
	label: string
	value: string
	hint?: string
	tone?: Tone
}

/**
 * Плитка с числом: подпись, крупное значение и уточнение под ним.
 *
 * @param label — что за число, подпись капсом
 * @param value — само значение, уже отформатированное
 * @param hint — уточнение мелким шрифтом (за сутки, из кэша и подобное)
 * @param tone — смысловая окраска значения: нейтральная, хорошая, тревожная, плохая
 */
export function StatTile({ label, value, hint, tone = 'neutral' }: IStatTileProps) {
	return (
		<div className={styles.tile}>
			<span className={styles.label}>{label}</span>
			<span className={clsx(styles.value, tone !== 'neutral' && styles[tone])}>{value}</span>
			{hint && <span className={styles.hint}>{hint}</span>}
		</div>
	)
}
