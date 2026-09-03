'use client'

import { useId, useState } from 'react'

import { fleetApi, type ModelOut, type RoleOut } from '@/shared/api'
import { cn } from '@/shared/lib/cn'
import { Field, TextArea, TextInput } from '@/shared/ui/Field'
import { GlassCard } from '@/shared/ui/GlassCard'

interface AgentEditorProps {
	roles: RoleOut[]
	models: Record<string, ModelOut>
	onChanged: () => Promise<void> | void
}

const emptyDraft = (model: string): RoleOut => ({
	name: '',
	model,
	fallback: null,
	thinking: false,
	max_tokens: 6000,
	temperature: 0.3,
	description: '',
	prompt: ''
})

const priceLabel = (model: ModelOut | undefined) =>
	model === undefined ? '' : model.price_out > 0 ? `$${model.price_out}/1M` : 'бесплатно'

/**
 * Состав команды: слева агенты, справа настройки и промпт выбранного.
 * Имя существующего агента не редактируется — переименование завело бы вторую
 * роль с тем же промптом, а промпты лежат в файлах по имени роли.
 */
export function AgentEditor({ roles, models, onChanged }: AgentEditorProps) {
	const ids = {
		name: useId(),
		model: useId(),
		fallback: useId(),
		max: useId(),
		temp: useId(),
		think: useId(),
		desc: useId(),
		prompt: useId()
	}
	const firstModel = Object.keys(models)[0] ?? ''
	const [selected, setSelected] = useState<string | null>(roles[0]?.name ?? null)
	const [draft, setDraft] = useState<RoleOut>(roles[0] ?? emptyDraft(firstModel))
	const [status, setStatus] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	const isNew = selected === null
	const set = <K extends keyof RoleOut>(field: K, value: RoleOut[K]) =>
		setDraft((prev) => ({ ...prev, [field]: value }))

	const save = async () => {
		if (draft.name.trim() === '') {
			setError('Имя агента не может быть пустым')
			return
		}
		setBusy(true)
		setError('')
		try {
			const saved = await fleetApi.saveRole({ ...draft, fallback: draft.fallback || null })
			await onChanged()
			setSelected(saved.name ?? draft.name)
			setStatus('сохранено')
			setTimeout(() => setStatus(''), 2000)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const remove = async () => {
		if (isNew || roles.length <= 1) return
		if (!window.confirm(`Удалить агента «${draft.name}»? Промпт останется в roles/.`)) return
		setBusy(true)
		setError('')
		try {
			await fleetApi.deleteRole(draft.name)
			await onChanged()
			setSelected(null)
			setDraft(emptyDraft(firstModel))
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="grid items-start gap-3 lg:grid-cols-[260px_1fr]">
			<div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-xl">
				{roles.map((role) => (
					<button
						key={role.name}
						type="button"
						onClick={() => {
							setSelected(role.name)
							setError('')
						}}
						className={cn(
							'block w-full cursor-pointer border-b border-white/5 px-4 py-2.5 text-left transition last:border-0 hover:bg-white/5',
							selected === role.name && 'bg-white/10 shadow-[inset_3px_0_0] shadow-emerald-500'
						)}
					>
						<span className="text-sm text-slate-100">{role.name}</span>
						<span className="block font-mono text-[11px] text-slate-400">
							{role.model}
							{role.thinking ? ' · думает' : ''}
						</span>
					</button>
				))}
				<button
					type="button"
					onClick={() => {
						setSelected(null)
						setDraft(emptyDraft(firstModel))
						setError('')
					}}
					className="block w-full cursor-pointer px-4 py-2.5 text-left text-sm font-medium text-emerald-400 transition hover:bg-white/5"
				>
					+ новый агент
				</button>
			</div>

			<GlassCard>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<Field label="Имя агента" id={ids.name}>
						<TextInput
							id={ids.name}
							value={draft.name}
							readOnly={!isNew}
							placeholder="reviewer"
							onChange={(e) => set('name', e.target.value)}
						/>
					</Field>
					<Field label="Модель" id={ids.model}>
						<select
							id={ids.model}
							value={draft.model}
							onChange={(e) => set('model', e.target.value)}
							className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
						>
							{Object.entries(models).map(([id, model]) => (
								<option key={id} value={id} className="bg-slate-900">
									{id} — {priceLabel(model)}
								</option>
							))}
						</select>
					</Field>
					<Field label="Резервная модель" id={ids.fallback} hint="куда уйти, если основная молчит">
						<select
							id={ids.fallback}
							value={draft.fallback ?? ''}
							onChange={(e) => set('fallback', e.target.value || null)}
							className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
						>
							<option value="" className="bg-slate-900">
								без резерва
							</option>
							{Object.entries(models).map(([id, model]) => (
								<option key={id} value={id} className="bg-slate-900">
									{id} — {priceLabel(model)}
								</option>
							))}
						</select>
					</Field>
					<Field label="Лимит токенов" id={ids.max}>
						<TextInput
							id={ids.max}
							type="number"
							min={256}
							max={32000}
							step={500}
							value={draft.max_tokens}
							onChange={(e) => set('max_tokens', Number(e.target.value))}
						/>
					</Field>
					<Field label="Температура" id={ids.temp}>
						<TextInput
							id={ids.temp}
							type="number"
							min={0}
							max={2}
							step={0.1}
							value={draft.temperature}
							onChange={(e) => set('temperature', Number(e.target.value))}
						/>
					</Field>
					<label className="flex items-center gap-2 self-end pb-2 text-sm" htmlFor={ids.think}>
						<input
							id={ids.think}
							type="checkbox"
							checked={draft.thinking}
							onChange={(e) => set('thinking', e.target.checked)}
							className="h-4 w-4 accent-emerald-500"
						/>
						думает вслух
					</label>
				</div>

				<Field label="Чем занимается" id={ids.desc}>
					<TextInput
						id={ids.desc}
						value={draft.description}
						placeholder="Ревьюер: ищет ошибки в чужом коде"
						onChange={(e) => set('description', e.target.value)}
					/>
				</Field>

				<Field label="Системный промпт" id={ids.prompt}>
					<TextArea
						id={ids.prompt}
						rows={18}
						value={draft.prompt}
						placeholder="Кто он, что делает, чего не делает, в каком виде отдаёт результат."
						onChange={(e) => set('prompt', e.target.value)}
						className="font-mono"
					/>
				</Field>

				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={save}
						disabled={busy}
						className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
					>
						Сохранить
					</button>
					<button
						type="button"
						onClick={remove}
						disabled={busy || isNew || roles.length <= 1}
						className="cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm text-rose-400 ring-1 ring-rose-400/30 transition hover:bg-white/10 disabled:opacity-40"
					>
						Удалить агента
					</button>
					{status && <span className="text-sm text-emerald-400">{status}</span>}
					{error && <span className="text-sm text-rose-400">{error}</span>}
				</div>

				<p className="mt-3 text-xs text-slate-400">
					Настройки и промпт подхватываются на лету — MCP-сервер перезапускать не нужно. Думанье включай там,
					где покупаешь именно рассуждение: у джунов оно жжёт токены впустую.
				</p>
			</GlassCard>
		</div>
	)
}
