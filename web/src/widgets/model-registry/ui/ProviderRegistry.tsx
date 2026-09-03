'use client'

import { useId, useState } from 'react'

import { fleetApi, type ProviderOut } from '@/shared/api'
import { cn } from '@/shared/lib/cn'
import { Field, TextInput } from '@/shared/ui/Field'
import { GlassCard } from '@/shared/ui/GlassCard'

interface ProviderRegistryProps {
	providers: ProviderOut[]
	onChanged: () => Promise<void> | void
}

interface Draft {
	name: string
	title: string
	base_url: string
	auth: string
	key_env: string
	verify_ssl: boolean
	send_thinking: boolean
	api_key: string
}

const empty: Draft = {
	name: '',
	title: '',
	base_url: '',
	auth: 'bearer',
	key_env: '',
	verify_ssl: true,
	send_thinking: false,
	api_key: ''
}

/**
 * Готовые заготовки: адреса и способ авторизации проверены по документации
 * провайдеров, человеку остаётся вставить ключ.
 *
 * У GigaChat выключена проверка TLS: его цепочка подписана НУЦ Минцифры,
 * которого нет в системном хранилище сертификатов.
 * Поле thinking понимают только GLM и DeepSeek — остальным его слать нельзя.
 */
const PRESETS: Array<{ label: string; draft: Draft; hint: string }> = [
	{
		label: 'Yandex Cloud',
		hint: 'ключ сервисного аккаунта; модель задаётся как gpt://<folder-id>/yandexgpt/latest',
		draft: {
			...empty,
			name: 'yandex',
			title: 'Yandex Cloud',
			base_url: 'https://llm.api.cloud.yandex.net/v1',
			auth: 'api-key'
		}
	},
	{
		label: 'GigaChat',
		hint: 'ключ авторизации из личного кабинета; модели GigaChat, GigaChat-Pro, GigaChat-Max',
		draft: {
			...empty,
			name: 'gigachat',
			title: 'GigaChat (Сбер)',
			base_url: 'https://gigachat.devices.sberbank.ru/api/v1',
			auth: 'gigachat',
			verify_ssl: false
		}
	},
	{
		label: 'OpenAI-совместимый',
		hint: 'любой сервис с /chat/completions: OpenRouter, локальная llama.cpp, vLLM',
		draft: { ...empty, auth: 'bearer' }
	}
]

export function ProviderRegistry({ providers, onChanged }: ProviderRegistryProps) {
	const ids = {
		name: useId(),
		title: useId(),
		url: useId(),
		auth: useId(),
		key: useId(),
		env: useId(),
		tls: useId(),
		think: useId()
	}
	const [draft, setDraft] = useState<Draft>(empty)
	const [selected, setSelected] = useState<string | null>(null)
	const [status, setStatus] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [check, setCheck] = useState('')

	const edit = (provider: ProviderOut) => {
		setSelected(provider.name)
		setDraft({
			name: provider.name,
			title: provider.title,
			base_url: provider.base_url,
			auth: provider.auth,
			key_env: provider.key_env ?? '',
			verify_ssl: provider.verify_ssl ?? true,
			send_thinking: provider.send_thinking ?? false,
			api_key: '' // существующий ключ наружу не отдаётся: пустое поле его не трогает
		})
		setStatus('')
		setError('')
	}

	const save = async () => {
		setBusy(true)
		setError('')
		try {
			await fleetApi.saveProvider({
				...draft,
				// Пустое поле означает «оставить как есть», иначе правка адреса стирала бы ключ.
				api_key: draft.api_key === '' ? null : draft.api_key
			})
			await onChanged()
			setSelected(draft.name)
			setStatus('сохранено')
			setTimeout(() => setStatus(''), 2000)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	// Проверка идёт по сохранённому провайдеру: ключ живёт на бэкенде и в браузер
	// не возвращается, поэтому проверить незаписанный черновик нечем.
	const probe = async () => {
		const name = selected ?? draft.name
		if (!name) return
		setBusy(true)
		setCheck('проверяю…')
		setError('')
		try {
			const result = await fleetApi.checkProvider(name)
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
		if (!window.confirm(`Удалить провайдера «${selected}» вместе с ключом?`)) return
		setBusy(true)
		setError('')
		try {
			await fleetApi.deleteProvider(selected)
			await onChanged()
			setSelected(null)
			setDraft(empty)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	return (
		<GlassCard title="Провайдеры" subtitle="куда ходить за моделями и чем авторизоваться">
			<div className="mt-3 flex flex-wrap gap-2">
				{PRESETS.map((preset) => (
					<button
						key={preset.label}
						type="button"
						title={preset.hint}
						onClick={() => {
							setSelected(null)
							setDraft(preset.draft)
							setStatus('')
							setError('')
						}}
						className="cursor-pointer rounded-lg bg-white/5 px-3 py-1.5 text-xs ring-1 ring-white/10 transition hover:bg-white/10"
					>
						+ {preset.label}
					</button>
				))}
			</div>

			<ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl ring-1 ring-white/10">
				{providers.map((provider) => (
					<li key={provider.name}>
						<button
							type="button"
							onClick={() => edit(provider)}
							className={cn(
								'flex w-full cursor-pointer flex-wrap items-baseline gap-x-3 px-3 py-2 text-left transition hover:bg-white/5',
								selected === provider.name && 'bg-white/10'
							)}
						>
							<span className="text-sm text-slate-100">{provider.title}</span>
							<span className="font-mono text-xs text-slate-400">{provider.base_url}</span>
							<span className="ml-auto text-xs text-slate-400">{provider.auth}</span>
							<span className={cn('text-xs', provider.has_key ? 'text-emerald-400' : 'text-amber-400')}>
								{provider.has_key ? 'ключ задан' : 'ключа нет'}
							</span>
						</button>
					</li>
				))}
			</ul>

			<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<Field label="Идентификатор" id={ids.name} hint="латиницей, например yandex">
					<TextInput
						id={ids.name}
						value={draft.name}
						onChange={(e) => setDraft({ ...draft, name: e.target.value })}
					/>
				</Field>
				<Field label="Название" id={ids.title}>
					<TextInput
						id={ids.title}
						value={draft.title}
						onChange={(e) => setDraft({ ...draft, title: e.target.value })}
					/>
				</Field>
				<Field label="Адрес API" id={ids.url} hint="без /chat/completions на конце">
					<TextInput
						id={ids.url}
						value={draft.base_url}
						placeholder="https://api.example.com/v1"
						onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
					/>
				</Field>
				<Field label="Авторизация" id={ids.auth}>
					<select
						id={ids.auth}
						value={draft.auth}
						onChange={(e) => setDraft({ ...draft, auth: e.target.value })}
						className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 transition hover:ring-white/20"
					>
						<option value="bearer" className="bg-slate-900">
							Bearer-токен
						</option>
						<option value="api-key" className="bg-slate-900">
							Api-Key (Yandex)
						</option>
						<option value="gigachat" className="bg-slate-900">
							GigaChat (обмен ключа на токен)
						</option>
					</select>
				</Field>
				<Field
					label="Ключ"
					id={ids.key}
					hint={selected ? 'пусто — оставить прежний' : 'хранится локально, в git не уезжает'}
				>
					<TextInput
						id={ids.key}
						type="password"
						value={draft.api_key}
						autoComplete="off"
						onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
					/>
				</Field>
				<Field label="Переменная окружения" id={ids.env} hint="запасной источник ключа">
					<TextInput
						id={ids.env}
						value={draft.key_env}
						placeholder="YANDEX_API_KEY"
						onChange={(e) => setDraft({ ...draft, key_env: e.target.value })}
					/>
				</Field>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-4">
				<label className="flex items-center gap-2 text-sm" htmlFor={ids.tls}>
					<input
						id={ids.tls}
						type="checkbox"
						checked={draft.verify_ssl}
						onChange={(e) => setDraft({ ...draft, verify_ssl: e.target.checked })}
						className="h-4 w-4 accent-emerald-500"
					/>
					проверять сертификат TLS
				</label>
				<label className="flex items-center gap-2 text-sm" htmlFor={ids.think}>
					<input
						id={ids.think}
						type="checkbox"
						checked={draft.send_thinking}
						onChange={(e) => setDraft({ ...draft, send_thinking: e.target.checked })}
						className="h-4 w-4 accent-emerald-500"
					/>
					понимает параметр thinking
				</label>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={save}
					disabled={busy || draft.name.trim() === '' || draft.base_url.trim() === ''}
					className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:opacity-50"
				>
					Сохранить провайдера
				</button>
				<button
					type="button"
					onClick={probe}
					disabled={busy || (selected === null && draft.name.trim() === '')}
					className="cursor-pointer rounded-lg bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-40"
				>
					Проверить подключение
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
			<p className="mt-2 text-xs text-slate-400">
				Проверка идёт с сохранёнными кредами: сначала «Сохранить провайдера», потом «Проверить». Ответ
				показывается как есть — так видно, ключ ли не тот, адрес или имя модели.
			</p>
		</GlassCard>
	)
}
