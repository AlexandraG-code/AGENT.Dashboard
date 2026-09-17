import type {
	CallOut,
	CatalogOut,
	ChartOut,
	PromptsOut,
	HintOut,
	HintsOut,
	SetupOut,
	ChatIn,
	ChatOut,
	CheckOut,
	JobIn,
	JobOut,
	JobsOut,
	RulesFoundOut,
	ContextOut,
	CouncilOut,
	DirsOut,
	DocIn,
	DocTextOut,
	EventsOut,
	ModelIn,
	OrgOut,
	ProjectIn,
	ProviderIn,
	RoleIn,
	RunOut,
	SavedOut,
	StateOut,
	StatsOut,
	TaskIn,
	TeamIn,
	UploadOut
} from './types'

/**
 * Клиент API команды. Запросы идут на относительный /api — его проксирует Next
 * на FastAPI, поэтому порт бэкенда нигде во фронте не зашит.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init)
	if (!response.ok) {
		// Бэкенд отдаёт detail строкой — показываем её как есть, она человекочитаемая.
		const raw = await response.text()
		let message = raw.slice(0, 300)
		try {
			const parsed: unknown = JSON.parse(raw)
			if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
				message = String((parsed as { detail: unknown }).detail)
			}
		} catch {
			// ответ не json — оставляем текст
		}
		throw new Error(message)
	}
	return (await response.json()) as T
}

const json = (body: unknown): RequestInit => ({
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
})

/** Пространство в строке запроса: состав команды у каждого проекта свой. */
const of = (project: string): string => `project=${encodeURIComponent(project)}`

export const fleetApi = {
	state: (project = '') => request<StateOut>(`/api/state?${of(project)}`),
	events: (since: number, limit = 120) => request<EventsOut>(`/api/events?since=${since}&limit=${limit}`),
	stats: (days = 30, project = '') =>
		request<StatsOut>(`/api/stats?days=${days}${project ? `&project=${encodeURIComponent(project)}` : ''}`),
	call: (id: string) => request<CallOut>(`/api/call/${encodeURIComponent(id)}`),
	dirs: (path = '') => request<DirsOut>(`/api/fs/dirs${path ? `?path=${encodeURIComponent(path)}` : ''}`),

	run: (body: TaskIn) => request<RunOut>('/api/run', json(body)),

	// Устройство команды: какие права можно выдать роли и кто чем занят.
	setup: (project: string) => request<SetupOut>(`/api/team/setup?${of(project)}`),
	saveSetup: (project: string, assignments: Record<string, string>) =>
		request<SavedOut>('/api/team/setup', json({ project, assignments })),

	// Подсказки к системному промпту: готовые куски текста для вставки.
	hints: () => request<HintsOut>('/api/hints'),
	saveHints: (items: HintOut[]) => request<SavedOut>('/api/hints', json({ hints: items })),

	// Служебные промпты приложения — тоже данные, а не код.
	prompts: () => request<PromptsOut>('/api/prompts'),
	savePrompts: (values: Record<string, string>) =>
		request<SavedOut>('/api/prompts', json({ prompts: values })),

	// Организация: отделы и регламенты, которые агенты читают до своей роли.
	org: (project: string) => request<OrgOut>(`/api/org?${of(project)}`),
	saveTeam: (body: TeamIn) => request<SavedOut>('/api/org/team', json(body)),
	deleteTeam: (project: string, name: string) =>
		request<SavedOut>(`/api/org/team/${encodeURIComponent(name)}?${of(project)}`, { method: 'DELETE' }),
	doc: (project: string, id: string) =>
		request<DocTextOut>(`/api/org/doc/${encodeURIComponent(id)}?${of(project)}`),
	saveDoc: (body: DocIn) => request<SavedOut>('/api/org/doc', json(body)),
	deleteDoc: (project: string, id: string) =>
		request<SavedOut>(`/api/org/doc/${encodeURIComponent(id)}?${of(project)}`, { method: 'DELETE' }),
	uploadDoc: (file: File, scope: string, project: string, teamName: string) => {
		const form = new FormData()
		form.append('file', file)
		form.append('scope', scope)
		form.append('project', project)
		form.append('team_name', teamName)
		return request<DocTextOut>('/api/org/doc/upload', { method: 'POST', body: form })
	},

	// Схема команды: кто кому подчиняется и что будет, если кто-то отвалится.
	chart: (project: string) => request<ChartOut>(`/api/team/chart?${of(project)}`),

	// Общий чат команды: человек, главный и агенты в одной ленте.
	chat: (project: string, limit = 100) =>
		request<ChatOut>(`/api/chat?project=${encodeURIComponent(project)}&limit=${limit}`),
	postChat: (body: ChatIn) => request<ChatOut>('/api/chat', json(body)),

	// Фоновые задачи: работа переживает закрытие вкладки, а дашборд следит за ней опросом.
	startJob: (body: JobIn) => request<JobOut>('/api/jobs', json(body)),
	jobs: (limit = 50) => request<JobsOut>(`/api/jobs?limit=${limit}`),
	job: (id: string) => request<JobOut>(`/api/jobs/${encodeURIComponent(id)}`),
	council: (body: TaskIn) => request<CouncilOut>('/api/council', json(body)),

	saveRole: (body: RoleIn) => request<SavedOut>('/api/role', json(body)),
	deleteRole: (project: string, name: string) =>
		request<SavedOut>(`/api/role/${encodeURIComponent(name)}?${of(project)}`, { method: 'DELETE' }),

	// Аватар агента: адрес картинки нужен и разметке, поэтому он отдельной функцией.
	avatarUrl: (project: string, name: string) =>
		`/api/role/${encodeURIComponent(name)}/avatar?${of(project)}`,

	saveProject: (body: ProjectIn) => request<SavedOut>('/api/project', json(body)),
	deleteProject: (id: string) => request<SavedOut>(`/api/project/${encodeURIComponent(id)}`, { method: 'DELETE' }),

	saveProvider: (body: ProviderIn) => request<SavedOut>('/api/provider', json(body)),
	deleteProvider: (name: string) =>
		request<SavedOut>(`/api/provider/${encodeURIComponent(name)}`, { method: 'DELETE' }),

	checkProvider: (name: string, model = '') =>
		request<CheckOut>(
			`/api/provider/${encodeURIComponent(name)}/check${model ? `?model=${encodeURIComponent(model)}` : ''}`,
			{ method: 'POST' }
		),

	providerModels: (name: string) => request<CatalogOut>(`/api/provider/${encodeURIComponent(name)}/models`),

	saveModel: (body: ModelIn) => request<SavedOut>('/api/model', json(body)),
	deleteModel: (id: string) => request<SavedOut>(`/api/model?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

	intakeText: (project: string, text: string, question: string, source: string) =>
		request<UploadOut>('/api/intake/text', json({ project, text, question, source })),

	probeRules: (project: string, repo: string) =>
		request<RulesFoundOut>(
			`/api/workspace/rules/probe?project=${encodeURIComponent(project)}&repo=${encodeURIComponent(repo)}`
		),

	importRules: (project: string, repo: string, compress: boolean) =>
		request<UploadOut>('/api/workspace/rules', json({ project, repo, compress })),

	context: (project: string) => request<ContextOut>(`/api/context/${encodeURIComponent(project)}`),
	saveNote: (project: string, name: string, text: string) =>
		request<SavedOut>('/api/context', json({ project, name, text })),

	upload: (project: string, file: File, question: string) => {
		const form = new FormData()
		form.append('file', file)
		form.append('project', project)
		form.append('question', question)
		return request<UploadOut>('/api/upload', { method: 'POST', body: form })
	}
}
