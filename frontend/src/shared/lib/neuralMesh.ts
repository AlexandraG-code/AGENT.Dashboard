/**
 * Объёмная сетка нейросети на фоне страницы.
 *
 * Узлы живут в кубе −1…1 и медленно дрейфуют, вся сцена вращается вокруг оси Y
 * и слегка качается по X. Проекция перспективная, поэтому дальние узлы мельче и
 * бледнее — именно это даёт объём без трёхмерной библиотеки: three.js весит
 * сотни килобайт, а здесь нужен один слой фона.
 *
 * По связям бегут импульсы: сетка без движения по рёбрам читается как
 * абстрактный узор, а с импульсами — как работающая сеть агентов.
 */

interface INode {
	x: number
	y: number
	z: number
	vx: number
	vy: number
	vz: number
}

interface IEdge {
	from: number
	to: number
	/** Фаза импульса 0…1; на каждом круге ребро выбирается заново. */
	phase: number
	speed: number
}

export interface IMeshOptions {
	accent: string
	glow: string
	/** false — сцена рисуется один раз и замирает (prefers-reduced-motion). */
	animate: boolean
}

const NODES_MAX = 84
const LINK_DISTANCE = 0.62
const FOV = 2.6
const DRIFT = 0.00004

const rand = (span: number) => (Math.random() * 2 - 1) * span

function build(count: number): INode[] {
	return Array.from({ length: count }, () => ({
		x: rand(1),
		y: rand(1),
		z: rand(1),
		vx: rand(DRIFT),
		vy: rand(DRIFT),
		vz: rand(DRIFT)
	}))
}

function link(nodes: INode[]): IEdge[] {
	const edges: IEdge[] = []
	for (let i = 0; i < nodes.length; i += 1) {
		for (let j = i + 1; j < nodes.length; j += 1) {
			const dx = nodes[i].x - nodes[j].x
			const dy = nodes[i].y - nodes[j].y
			const dz = nodes[i].z - nodes[j].z
			if (Math.sqrt(dx * dx + dy * dy + dz * dz) < LINK_DISTANCE) {
				edges.push({ from: i, to: j, phase: Math.random(), speed: 0.00006 + Math.random() * 0.00014 })
			}
		}
	}
	return edges
}

/**
 * Запускает анимацию в переданном канвасе. Возвращает функцию остановки —
 * ею же гасится цикл при размонтировании и при уходе со вкладки.
 */
export function startNeuralMesh(canvas: HTMLCanvasElement, options: IMeshOptions): () => void {
	const context = canvas.getContext('2d')
	if (!context) return () => {}

	// На узком экране узлов меньше: связей от них квадратично больше, а площади,
	// на которой это видно, — меньше.
	const nodes = build(window.innerWidth < 900 ? Math.round(NODES_MAX * 0.55) : NODES_MAX)
	const edges = link(nodes)
	let width = 0
	let height = 0
	let radius = 0
	let frame = 0
	let last = performance.now()
	let angle = 0

	const resize = () => {
		const ratio = Math.min(window.devicePixelRatio || 1, 2)
		width = canvas.clientWidth
		height = canvas.clientHeight
		radius = Math.min(width, height) * 0.62
		canvas.width = Math.round(width * ratio)
		canvas.height = Math.round(height * ratio)
		context.setTransform(ratio, 0, 0, ratio, 0, 0)
	}

	const draw = (elapsed: number) => {
		context.clearRect(0, 0, width, height)
		const cx = width / 2
		const cy = height * 0.46
		const cos = Math.cos(angle)
		const sin = Math.sin(angle)
		const tilt = Math.sin(angle * 0.4) * 0.22

		const flat = nodes.map((node) => {
			const x = node.x * cos - node.z * sin
			const z = node.x * sin + node.z * cos
			const y = node.y * Math.cos(tilt) - z * Math.sin(tilt)
			const depth = y * Math.sin(tilt) + z * Math.cos(tilt)
			const scale = FOV / (FOV + depth)
			return { x: cx + x * radius * scale, y: cy + y * radius * scale, scale }
		})

		context.lineWidth = 1
		for (const edge of edges) {
			const a = flat[edge.from]
			const b = flat[edge.to]
			const depth = (a.scale + b.scale) / 2
			context.strokeStyle = options.accent
			context.globalAlpha = Math.max(0, (depth - 0.62) * 0.42)
			context.beginPath()
			context.moveTo(a.x, a.y)
			context.lineTo(b.x, b.y)
			context.stroke()

			// Импульс: точка, бегущая от узла к узлу. Яркость гаснет к концам,
			// иначе на стыках рёбер видны вспышки.
			edge.phase += edge.speed * elapsed
			if (edge.phase > 1) edge.phase -= 1
			const t = edge.phase
			context.globalAlpha = Math.max(0, Math.sin(t * Math.PI)) * (depth - 0.6)
			context.fillStyle = options.glow
			context.beginPath()
			context.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1.6 * depth, 0, Math.PI * 2)
			context.fill()
		}

		for (const point of flat) {
			context.globalAlpha = Math.max(0, (point.scale - 0.6) * 0.9)
			context.fillStyle = options.glow
			context.beginPath()
			context.arc(point.x, point.y, 1.9 * point.scale, 0, Math.PI * 2)
			context.fill()
		}
		context.globalAlpha = 1
	}

	const step = (now: number) => {
		const elapsed = Math.min(now - last, 60)
		last = now
		angle += elapsed * 0.00004
		for (const node of nodes) {
			node.x += node.vx * elapsed
			node.y += node.vy * elapsed
			node.z += node.vz * elapsed
			// Отражение от стенок куба: так облако не расползается и не схлопывается.
			if (node.x < -1 || node.x > 1) node.vx *= -1
			if (node.y < -1 || node.y > 1) node.vy *= -1
			if (node.z < -1 || node.z > 1) node.vz *= -1
		}
		draw(elapsed)
		frame = requestAnimationFrame(step)
	}

	resize()
	window.addEventListener('resize', resize)
	if (options.animate) frame = requestAnimationFrame(step)
	else draw(0)

	return () => {
		cancelAnimationFrame(frame)
		window.removeEventListener('resize', resize)
	}
}
