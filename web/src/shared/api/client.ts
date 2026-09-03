import type {
	CallOut,
	CheckOut,
	ContextOut,
	CouncilOut,
	EventsOut,
	ModelIn,
	ProjectIn,
	ProviderIn,
	RoleIn,
	RunOut,
	SavedOut,
	StateOut,
	StatsOut,
	TaskIn,
	UploadOut
} from './types'

/**
 * Клиент API флота. Запросы идут на относительный /api — его проксирует Next
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

export const fleetApi = {
	state: () => request<StateOut>('/api/state'),
	events: (since: number, limit = 120) => request<EventsOut>(`/api/events?since=${since}&limit=${limit}`),
	stats: (days = 30, project = '') =>
		request<StatsOut>(`/api/stats?days=${days}${project ? `&project=${encodeURIComponent(project)}` : ''}`),
	call: (id: string) => request<CallOut>(`/api/call/${encodeURIComponent(id)}`),

	run: (body: TaskIn) => request<RunOut>('/api/run', json(body)),
	council: (body: TaskIn) => request<CouncilOut>('/api/council', json(body)),

	saveRole: (body: RoleIn) => request<SavedOut>('/api/role', json(body)),
	deleteRole: (name: string) => request<SavedOut>(`/api/role/${encodeURIComponent(name)}`, { method: 'DELETE' }),

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

	saveModel: (body: ModelIn) => request<SavedOut>('/api/model', json(body)),
	deleteModel: (id: string) => request<SavedOut>(`/api/model?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

	intakeText: (project: string, text: string, question: string, source: string) =>
		request<UploadOut>('/api/intake/text', json({ project, text, question, source })),

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
