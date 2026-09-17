'use client'

import { Alert } from 'antd'

import { useOrg } from '@/shared/model'

import { DocsPanel } from './DocsPanel'
import styles from './OrgStructure.module.scss'

interface IOrgStructureProps {
	project: string
}

/**
 * Регламенты пространства: устав, взаимодействие отделов, порядок работы. Всё
 * это агент читает до собственного промпта — промпт отвечает на вопрос «кто я и
 * как работаю», регламент — «как устроено вокруг».
 *
 * Отделы и их внутренние правила живут во вкладке состава команды: там их видно
 * вместе с агентами, а не отдельным списком.
 *
 * @param project — пространство: регламенты принадлежат его команде
 */
export function OrgStructure({ project }: IOrgStructureProps) {
	const org = useOrg(project)

	return (
		<div className={styles.root}>
			{org.error && <Alert type="error" message={org.error} />}
			<DocsPanel
				project={project}
				documents={org.documents}
				scopes={org.scopes}
				teams={org.teams}
				onSave={(body) => org.saveDoc(body)}
				onDelete={(id) => org.removeDoc(id)}
				onUpload={(file, scope, project, team) => org.uploadDoc(file, scope, project, team)}
			/>
		</div>
	)
}
