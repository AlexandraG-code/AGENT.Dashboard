'use client'

import { SettingOutlined } from '@ant-design/icons'
import { Button, Popover, Segmented, Slider } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUiSettings, type Contrast, type FontFamily, type Surface, type Weight } from '@/shared/model'

import styles from './UiSettings.module.scss'

/**
 * Настройки читаемости: кегль, шрифт, насыщенность, контраст и фон.
 * Живут в браузере и применяются атрибутами на <html> до первой отрисовки —
 * нужны людям со слабым зрением, поэтому вынесены в шапку, а не в глубину меню.
 */
export function UiSettings() {
	const { t } = useTranslation()
	const { fontSize, weight, contrast, surface, font, set, reset } = useUiSettings()
	const [open, setOpen] = useState(false)

	const content = (
		<div className={styles.panel}>
			<div className={styles.group}>
				<span className={styles.label}>
					{t('view.fontSize')}
					<b className={styles.size}>{fontSize} px</b>
				</span>
				<Slider min={14} max={26} step={1} value={fontSize} onChange={(value) => set({ fontSize: value })} />
			</div>

			<div className={styles.group}>
				<span className={styles.label}>{t('view.font')}</span>
				<Segmented<FontFamily>
					block
					value={font}
					onChange={(value) => set({ font: value })}
					options={[
						{ value: 'fira', label: t('view.fontFira') },
						{ value: 'system', label: t('view.fontSystem') },
						{ value: 'verdana', label: t('view.fontVerdana') }
					]}
				/>
			</div>

			<div className={styles.group}>
				<span className={styles.label}>{t('view.weight')}</span>
				<Segmented<Weight>
					block
					value={weight}
					onChange={(value) => set({ weight: value })}
					options={[
						{ value: 'normal', label: t('view.weightNormal') },
						{ value: 'medium', label: t('view.weightMedium') },
						{ value: 'bold', label: t('view.weightBold') }
					]}
				/>
			</div>

			<div className={styles.group}>
				<span className={styles.label}>{t('view.contrast')}</span>
				<Segmented<Contrast>
					block
					value={contrast}
					onChange={(value) => set({ contrast: value })}
					options={[
						{ value: 'normal', label: t('view.contrastNormal') },
						{ value: 'high', label: t('view.contrastHigh') }
					]}
				/>
			</div>

			<div className={styles.group}>
				<span className={styles.label}>{t('view.surface')}</span>
				<Segmented<Surface>
					block
					value={surface}
					onChange={(value) => set({ surface: value })}
					options={[
						{ value: 'glass', label: t('view.surfaceGlass') },
						{ value: 'solid', label: t('view.surfaceSolid') },
						{ value: 'light', label: t('view.surfaceLight') }
					]}
				/>
			</div>

			<div className={styles.footer}>
				<Button onClick={reset}>{t('common.reset')}</Button>
				<Button type="primary" onClick={() => setOpen(false)}>
					{t('common.done')}
				</Button>
			</div>
		</div>
	)

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
			trigger="click"
			placement="bottomRight"
			title={t('view.title')}
			content={content}
		>
			<Button icon={<SettingOutlined />}>{t('view.button')}</Button>
		</Popover>
	)
}
