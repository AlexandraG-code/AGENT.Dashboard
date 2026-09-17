'use client'

import { SettingOutlined } from '@ant-design/icons'
import { Button, ColorPicker, Popover, Segmented, Select, Slider, Tabs } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BACKGROUND_PRESETS, type IBackground } from '@/shared/config'
import { useUiSettings, type Contrast, type FontFamily, type Motion, type Surface, type Weight } from '@/shared/model'

import { useBackground } from '../model/useBackground'
import styles from './UiSettings.module.scss'

/**
 * Настройки интерфейса: читаемость (кегль, шрифт, насыщенность, контраст) и
 * оформление (поверхность, фон, фоновая анимация).
 *
 * Живут в браузере и применяются атрибутами на <html> до первой отрисовки —
 * нужны людям со слабым зрением, поэтому вынесены в шапку, а не в глубину меню.
 */
export function UiSettings() {
	const { t } = useTranslation()
	const { fontSize, weight, contrast, surface, font, motion, set, reset } = useUiSettings()
	const { preset, colors, setPreset, setStop, resetBackground } = useBackground()
	const [open, setOpen] = useState(false)

	const readability = (
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
		</div>
	)

	const appearance = (
		<div className={styles.panel}>
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

			<div className={styles.group}>
				<span className={styles.label}>{t('view.motion')}</span>
				<Segmented<Motion>
					block
					value={motion}
					onChange={(value) => set({ motion: value })}
					options={[
						{ value: 'neural', label: t('view.motionNeural') },
						{ value: 'still', label: t('view.motionStill') }
					]}
				/>
			</div>

			<div className={styles.group}>
				<span className={styles.label} id="bg-preset">
					{t('view.bgPreset')}
				</span>
				<Select
					aria-labelledby="bg-preset"
					value={preset}
					onChange={setPreset}
					options={[
						...Object.keys(BACKGROUND_PRESETS).map((key) => ({
							value: key,
							label: t(`view.bg_${key}`)
						})),
						{ value: 'custom', label: t('view.bgCustom'), disabled: true }
					]}
				/>
			</div>

			<div className={styles.group}>
				<span className={styles.label}>{t('view.bgColors')}</span>
				<div className={styles.pickers}>
					{(['base', 'glow1', 'glow2', 'glow3'] as (keyof IBackground)[]).map((stop) => (
						<label key={stop} className={styles.picker}>
							<ColorPicker
								value={colors[stop]}
								disabledAlpha
								onChangeComplete={(color) => setStop(stop, color.toHexString())}
							/>
							<span className={styles.pickerLabel}>{t(`view.bgStop_${stop}`)}</span>
						</label>
					))}
				</div>
				<Button className={styles.bgReset} size="small" onClick={resetBackground}>
					{t('view.bgReset')}
				</Button>
			</div>
		</div>
	)

	const content = (
		<div className={styles.wrap}>
			<Tabs
				size="small"
				items={[
					{ key: 'read', label: t('view.tabReadability'), children: readability },
					{ key: 'look', label: t('view.tabAppearance'), children: appearance }
				]}
			/>
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
