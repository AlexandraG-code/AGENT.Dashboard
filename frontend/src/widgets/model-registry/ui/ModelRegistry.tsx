'use client'

import { useId, useState } from 'react'

import { fleetApi, type ModelOut, type ProviderOut } from '@/shared/api'
import { cn } from '@/shared/lib/cn'
import { Field, TextInput } from '@/shared/ui/Field'
import { GlassCard } from '@/shared/ui/GlassCard'

interface ModelRegistryProps {
	models: Record<string, ModelOut>
	providers: ProviderOut[]
	onChanged: () => Promise<void> | void
}

interface Draft {
	id: string
	provider: string
	title: string
	price_in: number
	price_in_cached: number
	price_out: number
	concurrency: number
	vision: boolean
}

const empty = (provider: string): Draft => ({
	id: '',
	provider,
	title: '',
	price_in: 0,
	price_in_cached: 0,
	price_out: 0,
	concurrency: 3,
	vision: false
})

export function ModelRegistry({ models, providers, onChanged }: ModelRegistryProps) {
	const ids = {
		id: useId(),
		provider: useId(),
		title: useId(),
		pin: useId(),
		pcached: useId(),
		pout: useId(),
		conc: useId(),
		vision: useId()
	}
	const first = providers[0]?.name ?? ''
	const [draft, setDraft] = useState<Draft>(empty(first))
	const [selected, setSelected] = useState<string | null>(null)
	const [status, setStatus] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [check, setCheck] = useState('')

	const edit = (model: ModelOut) => {
		setSelected(model.id ?? '')
		setDraft({
			id: model.id ?? '',
			provider: model.provider,
			title: model.title ?? '',
			price_in: model.price_in ?? 0,
			price_in_cached: model.price_in_cached ?? 0,
			price_out: model.price_out ?? 0,
			concurrency: model.concurrency ?? 3,
			vision: model.vision ?? false
		})
		setStatus('')
		setError('')
	}

	const save = async () => {
		setBusy(true)
		setError('')
		try {
			await fleetApi.saveModel(draft)
			await onChanged()
			setSelected(draft.id)
			setStatus('сохранено')
			setTimeout(() => setStatus(''), 2000)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	const probe = async () => {
		if (draft.id.trim() === '' || draft.provider === '') return
		setBusy(true)
		setCheck('проверяю…')
		try {
			// Настоящий вызов модели с max_tokens=8: только он ловит опечатку в её имени.
			const result = await fleetApi.checkProvider(draft.provider, draft.id)
			setCheck(
				result.ok
					? `✓ ${result.message} (${result.seconds} с)`
					: `✗ ${result.status || 'нет ответа'}: ${result.message}${result.detail ? ` · ${result.detail.slice(0, 200)}` : ''}`
			)
		} catch (e) {
			setCheck(`✗ ${e instanceof Error ? e.message : String(e)}`)
		} finally {
			setBusy(false)
		}
	}

	const remove = async () => {
		if (selected === null) return
		if (!window.confirm(`Убрать модель «${selected}» из реестра?`)) return
		setBusy(true)
		setError('')
		try {
			await fleetApi.deleteModel(selected)
			await onChanged()
			setSelected(null)
			setDraft(empty(first))
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	return (
		<GlassCard title="Модели" subtitle="что можно выбрать агенту и почём это считается">
			<div className="mt-3">
				<button
					type="button"
					onClick={() => {
						setSelected(null)
						setDraft(empty(first))
						setStatus('')
						setError('')
					}}
					className="cursor-pointer rounded-lg bg-white/5 px-3 py-1.5 text-xs ring-1 ring-white/10 transition hover:bg-white/10"
				>
					+ новая модель
				</button>
			</div>

			<ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl ring-1 ring-white/10">
				{Object.values(models).map((model) => (
					<li key={model.id}>
						<button
							type="button"
							onClick={() => edit(model)}
							className={cn(
								'flex w-full cursor-pointer flex-wrap items-baseline gap-x-3 px-3 py-2 text-left transition hover:bg-white/5',
								selected === model.id && 'bg-white/10'
							)}
						>
							<span className="font-mono text-sm text-slate-100">{model.id}</span>
							<span className="text-xs text-slate-400">{model.provider}</span>
							{model.vision && <span className="text-xs text-sky-400">видит картинки</span>}
							<span className="ml-auto font-mono text-xs text-slate-400 tabular-nums">
								{(model.price_out ?? 0) > 0 ? `$${model.price_out}/1M выход` : 'бесплатно'} ·
								параллелизм {model.concurrency}
							</span>
						</button>
					</li>
				))}
			</ul>

			<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Field
					label="Идентификатор"
					id={ids.id}
					className="lg:col-span-2"
					hint="уходит в поле model запроса: glm-5.3 или gpt://<folder>/yandexgpt/latest"
				>
					<TextInput
						id={ids.id}
						value={draft.id}
						readOnly={selected !== null}
						onChange={(e) => setDraft({ ...draft, id: e.target.value })}
					/>
				</Field>
				<Field label="Провайдер" id={ids.provider}>
					<select
						id={ids.provider}
						value={draft.provider}
						onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
						className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
					>
						{providers.map((provider) => (
							<option key={provider.name} value={provider.name} className="bg-slate-900">
								{provider.title}
							</option>
						))}
					</select>
				</Field>
				<Field label="Понятное название" id={ids.title}>
					<TextInput
						id={ids.title}
						value={draft.title}
						onChange={(e) => setDraft({ ...draft, title: e.target.value })}
					/>
				</Field>
				<Field label="Цена входа, $/1M" id={ids.pin} hint="0 — если подписка">
					<TextInput
						id={ids.pin}
						type="number"
						step={0.001}
						min={0}
						value={draft.price_in}
						onChange={(e) => setDraft({ ...draft, price_in: Number(e.target.value) })}
					/>
				</Field>
				<Field label="Цена входа из кэша" id={ids.pcached}>
					<TextInput
						id={ids.pcached}
						type="number"
						step={0.001}
						min={0}
						value={draft.price_in_cached}
						onChange={(e) => setDraft({ ...draft, price_in_cached: Number(e.target.value) })}
					/>
				</Field>
				<Field label="Цена выхода, $/1M" id={ids.pout}>
					<TextInput
						id={ids.pout}
						type="number"
						step={0.001}
						min={0}
						value={draft.price_out}
						onChange={(e) => setDraft({ ...draft, price_out: Number(e.target.value) })}
					/>
				</Field>
				<Field label="Параллелизм" id={ids.conc} hint="сколько запросов разом разрешает тариф">
					<TextInput
						id={ids.conc}
						type="number"
						min={1}
						max={100}
						value={draft.concurrency}
						onChange={(e) => setDraft({ ...draft, concurrency: Number(e.target.value) })}
					/>
				</Field>
			</div>

			<label className="mt-3 flex items-center gap-2 text-sm" htmlFor={ids.vision}>
				<input
					id={ids.vision}
					type="checkbox"
					checked={draft.vision}
					onChange={(e) => setDraft({ ...draft, vision: e.target.checked })}
					className="h-4 w-4 accent-emerald-500"
				/>
				видит картинки
			</label>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={save}
					disabled={busy || draft.id.trim() === '' || draft.provider === ''}
					className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
				>
					Сохранить модель
				</button>
				<button
					type="button"
					onClick={probe}
					disabled={busy || draft.id.trim() === ''}
					className="cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-40"
				>
					Проверить модель
				</button>
				<button
					type="button"
					onClick={remove}
					disabled={busy || selected === null}
					className="cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm text-rose-400 ring-1 ring-rose-400/30 transition hover:bg-white/10 disabled:opacity-40"
				>
					Удалить
				</button>
				{status && <span className="text-sm text-emerald-400">{status}</span>}
				{error && <span className="text-sm text-rose-400">{error}</span>}
			</div>

			{check && (
				<p
					className={cn(
						'mt-3 rounded-lg px-3 py-2 font-mono text-xs break-words',
						check.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
					)}
				>
					{check}
				</p>
			)}

			<p className="mt-3 text-xs text-slate-400">
				Цены указываются за миллион токенов и нужны только для отчёта о расходах: считает их дашборд, а не
				провайдер. Для подписочных моделей оставь нули — тогда вызовы честно показываются бесплатными.
			</p>
		</GlassCard>
	)
}
