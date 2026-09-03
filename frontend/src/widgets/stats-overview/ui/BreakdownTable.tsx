'use client'

import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'

import type { ProjectStat, Slot } from '@/shared/api'
import { money, tokens } from '@/shared/lib/format'

interface IBreakdownTableProps {
	projects: Record<string, ProjectStat>
	titles: Record<string, string>
}

interface IRow extends Slot {
	key: string
	project: string
	model: string
}

/**
 * Тот же срез таблицей — вид, в котором данные читаются без цвета вообще:
 * скринридером, на печати, при дальтонизме.
 *
 * @param projects — разрез статистики по проектам с вложенными моделями
 * @param titles — человеческие названия пространств
 */
export function BreakdownTable({ projects, titles }: IBreakdownTableProps) {
	const { t } = useTranslation()

	const rows: IRow[] = Object.entries(projects).flatMap(([id, stat]) =>
		Object.entries(stat.by_model).map(([model, slot]) => ({
			...slot,
			key: `${id}:${model}`,
			project: titles[id] ?? (id === '—' ? t('overview.noSpace') : id),
			model
		}))
	)

	const columns: ColumnsType<IRow> = [
		{ title: t('common.project'), dataIndex: 'project', ellipsis: true },
		{ title: t('common.model'), dataIndex: 'model', ellipsis: true },
		{ title: t('common.calls'), dataIndex: 'calls', align: 'right', width: 110 },
		{
			title: t('common.input'),
			dataIndex: 'tokens_in',
			align: 'right',
			width: 130,
			render: (value: number) => tokens(value)
		},
		{
			title: t('common.output'),
			dataIndex: 'tokens_out',
			align: 'right',
			width: 130,
			render: (value: number) => tokens(value)
		},
		{
			title: t('common.cost'),
			dataIndex: 'cost',
			align: 'right',
			width: 130,
			render: (value: number) => money(value)
		}
	]

	return <Table<IRow> columns={columns} dataSource={rows} size="small" pagination={false} scroll={{ x: 700 }} />
}
