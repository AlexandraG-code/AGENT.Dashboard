'use client'
// Написано агентом junior (glm-5.3-flash) по ТЗ главного архитектора;
// правки главного: описания свойств вынесены в JSDoc над компонентом.

import { Avatar as AntAvatar } from 'antd'
import clsx from 'clsx'

import { fleetApi } from '@/shared/api'

import styles from './Avatar.module.scss'

interface IAvatarProps {
	project: string
	name: string
	icon?: string
	size?: number
	className?: string
}

/**
 * Круглый аватар агента, как в мессенджерах.
 *
 * Картинку человек загружает сам; пока её нет, antd показывает эмодзи-значок —
 * поэтому отдельного состояния «картинка не загрузилась» тут не нужно.
 *
 * @param project — пространство: роли принадлежат его команде, и картинка лежит в его папке
 * @param name — имя роли: по нему строится адрес картинки
 * @param icon — эмодзи-запаска, если картинки нет
 * @param size — диаметр кружка в пикселях
 */
export function Avatar({ project, name, icon, size, className }: IAvatarProps) {
	return (
		<AntAvatar
			src={fleetApi.avatarUrl(project, name)}
			size={size ?? 32}
			alt={name}
			className={clsx(styles.avatar, className)}
		>
			{icon || '🤖'}
		</AntAvatar>
	)
}
