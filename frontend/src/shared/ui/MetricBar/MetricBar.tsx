import styles from './MetricBar.module.scss'

export interface ISegment {
	key: string
	value: number
	color: string
	title: string
	dim?: boolean
}

interface IMetricBarProps {
	segments: ISegment[]
	widthPercent: number
}

/**
 * Горизонтальная полоса из долей: длина всей полосы показывает величину,
 * доли внутри — из чего она сложилась.
 *
 * @param segments — доли полосы: вес, цвет, всплывающая подпись и признак приглушения
 * @param widthPercent — длина полосы относительно самой большой в списке, в процентах
 */
export function MetricBar({ segments, widthPercent }: IMetricBarProps) {
	return (
		<div className={styles.bar} style={{ '--bar-width': `${Math.max(2, widthPercent)}%` } as React.CSSProperties}>
			{segments.map((segment) => (
				<div
					key={segment.key}
					className={styles.segment}
					title={segment.title}
					style={
						{
							flexGrow: segment.value || 1,
							'--segment-color': segment.color,
							'--segment-opacity': segment.dim ? 0.45 : 1
						} as React.CSSProperties
					}
				/>
			))}
		</div>
	)
}
