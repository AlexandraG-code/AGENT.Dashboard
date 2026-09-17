'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора;
// правки главного: именованный экспорт вместо default.

import { Button, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'

import type { CatalogModel } from '@/shared/api'
import { noteFor } from '@/shared/config'

import styles from './CatalogTable.module.scss'

interface ICatalogTableProps {
	models: CatalogModel[]
	onPick: (id: string) => void
}

/**
 * Таблица каталога моделей провайдера.
 *
 * @param models — строки каталога моделей
 * @param onPick — выбрать модель по идентификатору и подставить её в форму
 */
export function CatalogTable({ models, onPick }: ICatalogTableProps) {
	const { t } = useTranslation()

	const columns: ColumnsType<CatalogModel> = [
		{
			title: t('models.colModel'),
			dataIndex: 'id',
			render: (_: unknown, row: CatalogModel) => <span className={styles.id}>{row.id}</span>
		},
		{
			title: t('models.colWhat'),
			render: (_: unknown, row: CatalogModel) => noteFor(row.id)?.what ?? '—'
		},
		{
			title: t('models.colLimits'),
			render: (_: unknown, row: CatalogModel) => (
				<span className={styles.note}>{noteFor(row.id)?.limits ?? '—'}</span>
			)
		},
		{
			title: t('models.colOwner'),
			dataIndex: 'owned_by'
		},
		{
			title: '',
			render: (_: unknown, row: CatalogModel) => (
				<Button size="small" onClick={() => onPick(row.id)}>
					{row.registered ? t('models.colAgain') : t('models.colTake')}
				</Button>
			)
		}
	]

	return (
		<Table<CatalogModel>
			size="small"
			rowKey="id"
			pagination={false}
			scroll={{ y: 320 }}
			dataSource={models}
			columns={columns}
			rowClassName={(row) => (row.registered ? styles.registered : '')}
		/>
	)
}
