'use client'

import { ArrowUpOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons'
import { Alert, Button, Modal, Spin, Tag } from 'antd'
import { useTranslation } from 'react-i18next'

import type { DirEntry } from '@/shared/api'
import { Toolbar } from '@/shared/ui'

import styles from './DirPicker.module.scss'

interface IDirPickerProps {
	open: boolean
	path: string
	parent: string | null
	entries: DirEntry[]
	busy: boolean
	error: string
	onGo: (path: string) => void
	onPick: (path: string) => void
	onClose: () => void
}

/**
 * Окно выбора каталога: перечисляет папки машины команды и отдаёт абсолютный путь.
 * Папки с признаком репозитория (.git, CLAUDE.md, AGENTS.md, .cursorrules) помечены —
 * именно из них есть что забирать в правила.
 *
 * @param open — показывать ли окно
 * @param path — каталог, который сейчас открыт
 * @param parent — куда ведёт кнопка «наверх»; null означает корень
 * @param entries — вложенные каталоги
 * @param busy — идёт запрос листинга
 * @param error — текст ошибки от бэкенда, показывается как есть
 * @param onGo — перейти в каталог
 * @param onPick — выбрать текущий каталог и закрыть окно
 * @param onClose — закрыть окно без выбора
 */
export function DirPicker({ open, path, parent, entries, busy, error, onGo, onPick, onClose }: IDirPickerProps) {
	const { t } = useTranslation()

	return (
		<Modal
			open={open}
			onCancel={onClose}
			title={t('spaces.pickerTitle')}
			width={640}
			footer={
				<Toolbar>
					<Button onClick={onClose}>{t('common.cancel')}</Button>
					<Button type="primary" disabled={path === ''} onClick={() => onPick(path)}>
						{t('spaces.pickerChoose')}
					</Button>
				</Toolbar>
			}
		>
			<div className={styles.head}>
				<Button
					size="small"
					icon={<ArrowUpOutlined />}
					disabled={parent === null || busy}
					onClick={() => parent !== null && onGo(parent)}
				>
					{t('spaces.pickerUp')}
				</Button>
				<span className={styles.path}>{path}</span>
			</div>

			{error !== '' && <Alert type="error" message={error} />}

			{busy ? (
				<Spin description={t('app.loading')} />
			) : (
				<ul className={styles.list}>
					{entries.length === 0 && <li className={styles.empty}>{t('spaces.pickerEmpty')}</li>}
					{entries.map((entry) => (
						<li key={entry.path}>
							<button type="button" className={styles.row} onClick={() => onGo(entry.path)}>
								{entry.is_repo ? <FolderOpenOutlined /> : <FolderOutlined />}
								<span className={styles.name}>{entry.name}</span>
								{entry.is_repo && <Tag color="success">{t('spaces.pickerRepo')}</Tag>}
							</button>
						</li>
					))}
				</ul>
			)}
		</Modal>
	)
}
