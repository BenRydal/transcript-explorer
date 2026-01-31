/**
 * Turn-Taking Network Visualization
 *
 * A directed graph where nodes are speakers and weighted edges show
 * transition frequency — how often speaker A is followed by speaker B.
 *
 * Performance: Uses an offscreen buffer that only re-renders when data changes.
 * Hover effects are drawn on top of the cached buffer each frame.
 */

import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';

// --- Drawing constants ---
const MIN_NODE_RADIUS = 20;
const MAX_NODE_RADIUS = 60;
const MIN_EDGE_WIDTH = 1;
const MAX_EDGE_WIDTH = 10;
const ARROW_SIZE = 8;
const SELF_LOOP_RADIUS = 25;
const SELF_LOOP_GAP = Math.PI / 3; // 60° gap where loop connects to node
const NODE_LABEL_SIZE = 11;
const EDGE_LABEL_SIZE = 9;
const OVERLAY_OPACITY = 180;
const HOVER_OUTLINE_WEIGHT = 3;
const EDGE_HIT_TOLERANCE = 8;
const CURVE_OFFSET_FACTOR = 0.15;
const LAYOUT_RADIUS_FACTOR = 0.33;

// --- Types ---

export interface NetworkData {
	transitions: Map<string, Map<string, { count: number; firstDataPoint: DataPoint }>>;
	speakerStats: Map<string, { wordCount: number; turnCount: number; firstDataPoint: DataPoint }>;
}

interface NodeLayout {
	speaker: string;
	x: number;
	y: number;
	radius: number;
	user: User | undefined;
}

interface EdgeLayout {
	from: string;
	to: string;
	count: number;
	firstDataPoint: DataPoint;
	isSelfLoop: boolean;
}

interface SelfLoopGeometry {
	cx: number;
	cy: number;
	arcStart: number;
	arcStop: number;
}

interface CurvedEdgeGeometry {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	cpX: number;
	cpY: number;
}

// --- Buffer cache ---

let bufferCache: {
	buffer: p5.Graphics | null;
	cacheKey: string | null;
	nodes: NodeLayout[];
	nodeMap: Map<string, NodeLayout>;
	edges: EdgeLayout[];
	maxEdgeCount: number;
	centerX: number;
	centerY: number;
} = {
	buffer: null,
	cacheKey: null,
	nodes: [],
	nodeMap: new Map(),
	edges: [],
	maxEdgeCount: 0,
	centerX: 0,
	centerY: 0
};

export function clearTurnNetworkBuffer(): void {
	if (bufferCache.buffer) {
		bufferCache.buffer.remove();
	}
	bufferCache = {
		buffer: null,
		cacheKey: null,
		nodes: [],
		nodeMap: new Map(),
		edges: [],
		maxEdgeCount: 0,
		centerX: 0,
		centerY: 0
	};
}

// --- Geometry helpers ---

/** Compute self-loop arc geometry oriented away from layout center. */
function getSelfLoopGeometry(
	node: NodeLayout,
	centerX: number,
	centerY: number
): SelfLoopGeometry {
	const dx = node.x - centerX;
	const dy = node.y - centerY;
	const dist = Math.sqrt(dx * dx + dy * dy);
	// Single node at center: point the loop upward
	const outAngle = dist < 1 ? -Math.PI / 2 : Math.atan2(dy, dx);

	const loopDist = node.radius + SELF_LOOP_RADIUS;
	const cx = node.x + Math.cos(outAngle) * loopDist;
	const cy = node.y + Math.sin(outAngle) * loopDist;

	// Gap faces the node (inward direction)
	const inAngle = outAngle + Math.PI;
	const gapHalf = SELF_LOOP_GAP / 2;

	return {
		cx,
		cy,
		arcStart: inAngle + gapHalf,
		arcStop: inAngle + Math.PI * 2 - gapHalf
	};
}

/** Compute curved edge geometry clipped to node borders. */
function getCurvedEdgeGeometry(
	fromNode: NodeLayout,
	toNode: NodeLayout
): CurvedEdgeGeometry | null {
	const dx = toNode.x - fromNode.x;
	const dy = toNode.y - fromNode.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist === 0) return null;

	const ux = dx / dist;
	const uy = dy / dist;
	const nx = -uy;
	const ny = ux;

	const startX = fromNode.x + ux * fromNode.radius;
	const startY = fromNode.y + uy * fromNode.radius;
	const endX = toNode.x - ux * toNode.radius;
	const endY = toNode.y - uy * toNode.radius;

	const curveOffset = dist * CURVE_OFFSET_FACTOR;

	return {
		startX,
		startY,
		endX,
		endY,
		cpX: (startX + endX) / 2 + nx * curveOffset,
		cpY: (startY + endY) / 2 + ny * curveOffset
	};
}

// --- Main class ---

export class TurnNetwork {
	sk: p5;
	bounds: Bounds;
	users: User[];
	config: ConfigStoreType;
	userMap: Map<string, User>;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.users = get(UserStore);
		this.config = get(ConfigStore);
		this.userMap = new Map(this.users.map((user) => [user.name, user]));
	}

	draw(networkData: NetworkData): { hoveredElement: DataPoint | null } {
		const cacheKey = this.getCacheKey(networkData);

		if (cacheKey !== bufferCache.cacheKey || !bufferCache.buffer) {
			this.renderToBuffer(networkData);
			bufferCache.cacheKey = cacheKey;
		}

		this.sk.image(bufferCache.buffer!, this.bounds.x, this.bounds.y);

		const hovered = this.findHoveredElement();
		if (hovered) {
			this.drawHoverEffect(hovered);
			this.showElementTooltip(hovered);
		}

		return { hoveredElement: hovered?.dataPoint || null };
	}

	getCacheKey(networkData: NetworkData): string {
		const userStates = this.users.map((u) => `${u.name}:${u.color}:${u.enabled}`).join(',');
		let transitionKey = '';
		for (const [from, targets] of networkData.transitions) {
			for (const [to, data] of targets) {
				transitionKey += `${from}>${to}:${data.count},`;
			}
		}
		return `${this.bounds.width}|${this.bounds.height}|${transitionKey}|${userStates}`;
	}

	// --- Buffer rendering ---

	renderToBuffer(networkData: NetworkData): void {
		if (bufferCache.buffer) {
			bufferCache.buffer.remove();
		}

		const buf = this.sk.createGraphics(this.bounds.width, this.bounds.height);
		buf.textFont(this.sk.font);

		const speakers = Array.from(networkData.speakerStats.keys()).filter(
			(s) => this.userMap.get(s)?.enabled
		);

		const centerX = this.bounds.width / 2;
		const centerY = this.bounds.height / 2;
		bufferCache.centerX = centerX;
		bufferCache.centerY = centerY;

		if (speakers.length === 0) {
			bufferCache.nodes = [];
			bufferCache.nodeMap = new Map();
			bufferCache.edges = [];
			bufferCache.maxEdgeCount = 0;
			bufferCache.buffer = buf;
			return;
		}

		// Layout nodes in a circle
		const layoutRadius = Math.min(this.bounds.width, this.bounds.height) * LAYOUT_RADIUS_FACTOR;

		let maxWordCount = 0;
		for (const stats of networkData.speakerStats.values()) {
			if (stats.wordCount > maxWordCount) maxWordCount = stats.wordCount;
		}

		const nodes: NodeLayout[] = [];
		const nodeMap = new Map<string, NodeLayout>();
		for (let i = 0; i < speakers.length; i++) {
			const speaker = speakers[i];
			const stats = networkData.speakerStats.get(speaker)!;
			const angle = (i / speakers.length) * Math.PI * 2 - Math.PI / 2;

			const node: NodeLayout = {
				speaker,
				x: speakers.length === 1 ? centerX : centerX + Math.cos(angle) * layoutRadius,
				y: speakers.length === 1 ? centerY : centerY + Math.sin(angle) * layoutRadius,
				radius: this.sk.map(
					stats.wordCount,
					0,
					maxWordCount,
					MIN_NODE_RADIUS,
					MAX_NODE_RADIUS,
					true
				),
				user: this.userMap.get(speaker)
			};
			nodes.push(node);
			nodeMap.set(speaker, node);
		}

		// Build edges
		const edges: EdgeLayout[] = [];
		let maxEdgeCount = 0;
		for (const [from, targets] of networkData.transitions) {
			for (const [to, data] of targets) {
				if (!this.userMap.get(from)?.enabled || !this.userMap.get(to)?.enabled) continue;
				edges.push({
					from,
					to,
					count: data.count,
					firstDataPoint: data.firstDataPoint,
					isSelfLoop: from === to
				});
				if (data.count > maxEdgeCount) maxEdgeCount = data.count;
			}
		}

		bufferCache.nodes = nodes;
		bufferCache.nodeMap = nodeMap;
		bufferCache.edges = edges;
		bufferCache.maxEdgeCount = maxEdgeCount;

		// Draw edges
		for (const edge of edges) {
			const fromNode = nodeMap.get(edge.from);
			const toNode = nodeMap.get(edge.to);
			if (!fromNode || !toNode) continue;

			const edgeColor = buf.color(fromNode.user?.color || '#cccccc');
			edgeColor.setAlpha(150);
			const weight = this.edgeWeight(edge.count);

			buf.stroke(edgeColor);
			buf.strokeWeight(weight);
			buf.noFill();

			if (edge.isSelfLoop) {
				const loop = getSelfLoopGeometry(fromNode, centerX, centerY);
				buf.arc(
					loop.cx,
					loop.cy,
					SELF_LOOP_RADIUS * 2,
					SELF_LOOP_RADIUS * 2,
					loop.arcStart,
					loop.arcStop
				);

				// Arrowhead tangent to arc at its endpoint
				const endPtX = loop.cx + SELF_LOOP_RADIUS * Math.cos(loop.arcStop);
				const endPtY = loop.cy + SELF_LOOP_RADIUS * Math.sin(loop.arcStop);
				const tanX = -Math.sin(loop.arcStop);
				const tanY = Math.cos(loop.arcStop);
				this.drawArrowhead(
					buf,
					endPtX - tanX * ARROW_SIZE,
					endPtY - tanY * ARROW_SIZE,
					endPtX,
					endPtY,
					edgeColor,
					weight
				);
			} else {
				const geom = getCurvedEdgeGeometry(fromNode, toNode);
				if (!geom) continue;

				buf.beginShape();
				buf.vertex(geom.startX, geom.startY);
				buf.quadraticVertex(geom.cpX, geom.cpY, geom.endX, geom.endY);
				buf.endShape();

				this.drawArrowhead(
					buf,
					geom.cpX,
					geom.cpY,
					geom.endX,
					geom.endY,
					edgeColor,
					weight
				);
			}
		}

		// Draw edge count labels
		buf.textSize(EDGE_LABEL_SIZE);
		buf.textAlign(buf.CENTER, buf.CENTER);
		for (const edge of edges) {
			if (edge.isSelfLoop) continue;
			const fromNode = nodeMap.get(edge.from);
			const toNode = nodeMap.get(edge.to);
			if (!fromNode || !toNode) continue;

			const geom = getCurvedEdgeGeometry(fromNode, toNode);
			if (!geom) continue;

			// Label at bezier midpoint (t=0.5)
			const labelX = 0.25 * geom.startX + 0.5 * geom.cpX + 0.25 * geom.endX;
			const labelY = 0.25 * geom.startY + 0.5 * geom.cpY + 0.25 * geom.endY;

			buf.noStroke();
			buf.fill(255, 200);
			buf.rect(labelX - 10, labelY - 7, 20, 14, 3);
			buf.fill(80);
			buf.text(String(edge.count), labelX, labelY);
		}

		// Draw nodes
		for (const node of nodes) {
			const color = node.user?.color || '#cccccc';
			const fillColor = buf.color(color);
			fillColor.setAlpha(200);

			buf.noStroke();
			buf.fill(fillColor);
			buf.ellipse(node.x, node.y, node.radius * 2);

			buf.noFill();
			buf.stroke(color);
			buf.strokeWeight(2);
			buf.ellipse(node.x, node.y, node.radius * 2);

			buf.noStroke();
			buf.fill(255);
			buf.textSize(NODE_LABEL_SIZE);
			buf.textAlign(buf.CENTER, buf.CENTER);
			buf.text(this.truncateLabel(node.speaker, node.radius * 1.6, buf), node.x, node.y);
		}

		bufferCache.buffer = buf;
	}

	// --- Drawing helpers ---

	edgeWeight(count: number): number {
		return this.sk.map(
			count,
			1,
			Math.max(bufferCache.maxEdgeCount, 1),
			MIN_EDGE_WIDTH,
			MAX_EDGE_WIDTH,
			true
		);
	}

	drawArrowhead(
		g: p5.Graphics,
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
		color: p5.Color,
		weight: number
	): void {
		const angle = Math.atan2(toY - fromY, toX - fromX);
		const size = ARROW_SIZE + weight * 0.5;

		g.fill(color);
		g.noStroke();
		g.beginShape();
		g.vertex(toX, toY);
		g.vertex(
			toX - size * Math.cos(angle - Math.PI / 6),
			toY - size * Math.sin(angle - Math.PI / 6)
		);
		g.vertex(
			toX - size * Math.cos(angle + Math.PI / 6),
			toY - size * Math.sin(angle + Math.PI / 6)
		);
		g.endShape(g.CLOSE);
	}

	truncateLabel(text: string, maxWidth: number, g: p5 | p5.Graphics): string {
		if (g.textWidth(text) <= maxWidth) return text;
		let truncated = text;
		while (truncated.length > 0 && g.textWidth(truncated + '..') > maxWidth) {
			truncated = truncated.slice(0, -1);
		}
		return truncated.length > 0 ? truncated + '..' : '';
	}

	// --- Hover detection ---

	findHoveredElement(): {
		type: 'node' | 'edge';
		speaker: string;
		dataPoint: DataPoint | null;
		edge?: EdgeLayout;
		node?: NodeLayout;
	} | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const localX = this.sk.mouseX - this.bounds.x;
		const localY = this.sk.mouseY - this.bounds.y;

		// Nodes have priority
		for (const node of bufferCache.nodes) {
			const dx = localX - node.x;
			const dy = localY - node.y;
			if (dx * dx + dy * dy <= node.radius * node.radius) {
				return {
					type: 'node',
					speaker: node.speaker,
					dataPoint: this.getNodeDataPoint(node.speaker),
					node
				};
			}
		}

		// Edges
		for (const edge of bufferCache.edges) {
			if (this.isNearEdge(localX, localY, edge)) {
				return { type: 'edge', speaker: edge.from, dataPoint: edge.firstDataPoint, edge };
			}
		}

		return null;
	}

	getNodeDataPoint(speaker: string): DataPoint | null {
		for (const edge of bufferCache.edges) {
			if (edge.from === speaker || edge.to === speaker) {
				return edge.firstDataPoint;
			}
		}
		return null;
	}

	isNearEdge(localX: number, localY: number, edge: EdgeLayout): boolean {
		const fromNode = bufferCache.nodeMap.get(edge.from);
		const toNode = bufferCache.nodeMap.get(edge.to);
		if (!fromNode || !toNode) return false;

		if (edge.isSelfLoop) {
			const loop = getSelfLoopGeometry(fromNode, bufferCache.centerX, bufferCache.centerY);
			const dist = Math.sqrt((localX - loop.cx) ** 2 + (localY - loop.cy) ** 2);
			return Math.abs(dist - SELF_LOOP_RADIUS) < EDGE_HIT_TOLERANCE;
		}

		const geom = getCurvedEdgeGeometry(fromNode, toNode);
		if (!geom) return false;

		// Sample quadratic bezier
		for (let t = 0; t <= 1; t += 0.1) {
			const mt = 1 - t;
			const px = mt * mt * geom.startX + 2 * mt * t * geom.cpX + t * t * geom.endX;
			const py = mt * mt * geom.startY + 2 * mt * t * geom.cpY + t * t * geom.endY;
			if (Math.sqrt((localX - px) ** 2 + (localY - py) ** 2) < EDGE_HIT_TOLERANCE) return true;
		}

		return false;
	}

	// --- Hover rendering ---

	drawHoverEffect(hovered: {
		type: 'node' | 'edge';
		speaker: string;
		edge?: EdgeLayout;
		node?: NodeLayout;
	}): void {
		// Dim overlay
		this.sk.noStroke();
		this.sk.fill(255, OVERLAY_OPACITY);
		this.sk.rect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);

		if (hovered.type === 'node' && hovered.node) {
			for (const edge of bufferCache.edges) {
				if (edge.from === hovered.speaker || edge.to === hovered.speaker) {
					this.redrawEdge(edge);
				}
			}
			this.redrawNode(hovered.node);
		} else if (hovered.type === 'edge' && hovered.edge) {
			this.redrawEdge(hovered.edge);
			const fromNode = bufferCache.nodeMap.get(hovered.edge.from);
			const toNode = bufferCache.nodeMap.get(hovered.edge.to);
			if (fromNode) this.redrawNode(fromNode);
			if (toNode && toNode !== fromNode) this.redrawNode(toNode);
		}
	}

	redrawNode(node: NodeLayout): void {
		const sx = this.bounds.x + node.x;
		const sy = this.bounds.y + node.y;
		const color = node.user?.color || '#cccccc';

		this.sk.noStroke();
		this.sk.fill(this.sk.color(color));
		this.sk.ellipse(sx, sy, node.radius * 2);

		this.sk.noFill();
		this.sk.stroke(color);
		this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.sk.ellipse(sx, sy, node.radius * 2);

		this.sk.noStroke();
		this.sk.fill(255);
		this.sk.textSize(NODE_LABEL_SIZE);
		this.sk.textAlign(this.sk.CENTER, this.sk.CENTER);
		this.sk.text(this.truncateLabel(node.speaker, node.radius * 1.6, this.sk), sx, sy);
	}

	redrawEdge(edge: EdgeLayout): void {
		const fromNode = bufferCache.nodeMap.get(edge.from);
		const toNode = bufferCache.nodeMap.get(edge.to);
		if (!fromNode || !toNode) return;

		const edgeColor = this.sk.color(fromNode.user?.color || '#cccccc');
		const weight = this.edgeWeight(edge.count);

		this.sk.stroke(edgeColor);
		this.sk.strokeWeight(weight + 1);
		this.sk.noFill();

		const ox = this.bounds.x;
		const oy = this.bounds.y;

		if (edge.isSelfLoop) {
			const loop = getSelfLoopGeometry(fromNode, bufferCache.centerX, bufferCache.centerY);
			this.sk.arc(
				ox + loop.cx,
				oy + loop.cy,
				SELF_LOOP_RADIUS * 2,
				SELF_LOOP_RADIUS * 2,
				loop.arcStart,
				loop.arcStop
			);
		} else {
			const geom = getCurvedEdgeGeometry(fromNode, toNode);
			if (!geom) return;

			this.sk.beginShape();
			this.sk.vertex(ox + geom.startX, oy + geom.startY);
			this.sk.quadraticVertex(ox + geom.cpX, oy + geom.cpY, ox + geom.endX, oy + geom.endY);
			this.sk.endShape();
		}
	}

	// --- Tooltips ---

	showElementTooltip(hovered: {
		type: 'node' | 'edge';
		speaker: string;
		edge?: EdgeLayout;
		node?: NodeLayout;
	}): void {
		const user = this.userMap.get(hovered.speaker);
		const color = user?.color || '#cccccc';

		if (hovered.type === 'node') {
			let fromCount = 0;
			let toCount = 0;
			for (const edge of bufferCache.edges) {
				if (edge.from === hovered.speaker) fromCount += edge.count;
				if (edge.to === hovered.speaker) toCount += edge.count;
			}

			const content =
				`<b>${hovered.speaker}</b>\n` +
				`<span style="font-size: 0.85em; opacity: 0.7">` +
				`Initiated ${fromCount} transition${fromCount !== 1 ? 's' : ''}  ·  ` +
				`Received ${toCount} transition${toCount !== 1 ? 's' : ''}</span>`;
			showTooltip(this.sk.mouseX, this.sk.mouseY, content, color, this.sk.height);
		} else if (hovered.edge) {
			const content =
				`<b>${hovered.edge.from} → ${hovered.edge.to}</b>\n` +
				`<span style="font-size: 0.85em; opacity: 0.7">` +
				`${hovered.edge.count} transition${hovered.edge.count !== 1 ? 's' : ''}</span>`;
			showTooltip(this.sk.mouseX, this.sk.mouseY, content, color, this.sk.height);
		}
	}
}
