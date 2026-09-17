'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора;
// правки главного: описания свойств вынесены в JSDoc над компонентом.

import { ThunderboltOutlined } from '@ant-design/icons'
import { Badge, Button } from 'antd'
import { useTranslation } from 'react-i18next'

interface IActivityBadgeProps {
	count: number
	onClick: () => void
}

/**
 * Кнопка со счётчиком запущенных процессов для шапки дашборда.
 *
 * @param count — сколько задач сейчас в очереди и в работе; ноль antd прячет сам
 * @param onClick — открыть подробности по процессам
 */
export function ActivityBadge({ count, onClick }: IActivityBadgeProps) {
	const { t } = useTranslation()

	return (
		<Badge count={count} size="small">
			<Button icon={<ThunderboltOutlined />} onClick={onClick}>
				{t('activity.button')}
			</Button>
		</Badge>
	)
}
