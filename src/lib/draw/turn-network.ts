/**
 * Turn-Taking Network Visualization
 *
 * A directed graph where nodes are speakers and weighted edges show
 * transition frequency — how often speaker A is followed by speaker B.
 *
 * With only 2-5 speakers, layout and rendering are trivially cheap —
 * no offscreen buffer or caching needed. Everything redraws each frame.
 */

import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import { DEFAULT_SPEAKER_COLOR } from '../constants/ui';
import { withDimming } from './draw-utils';

const MIN_NODE_RADIUS_RATIO = 0.04;
const MAX_NODE_RADIUS_RATIO = 0.12;
const MIN_EDGE_WIDTH = 1;
const MAX_EDGE_WIDTH = 10;
const ARROW_SIZE = 8;
const SELF_LOOP_RADIUS_RATIO = 0.05;
const SELF_LOOP_GAP = Math.PI / 3;
const NODE_LABEL_RATIO = 0.025;
const EDGE_LABEL_RATIO = 0.02;
const OVERLAY_OPACITY = 180;
const EDGE_HIT_TOLERANCE = 8;
const EDGE_HIT_TOLERANCE_SQ = EDGE_HIT_TOLERANCE * EDGE_HIT_TOLERANCE;
const CURVE_OFFSET_FACTOR = 0.15;
const LAYOUT_RADIUS_FACTOR = 0.33;

// --- Types ---

export interface NetworkData {
	transitions: Map<string, Map<string, { count: number; wordCount: number; turnStartPoints: DataPoint[] }>>;
	speakerStats: Map<string, { wordCount: number; turnCount: number; turnStartPoints: DataPoint[] }>;
}

interface NodeLayout {
	speaker: string;
	x: number;
	y: number;
	radius: number;
	user: User | undefined;
	turnStartPoints: DataPoint[];
}

interface EdgeLayout {
	from: string;
	to: string;
	count: number;
	wordCount: number;
	weight: number;
	turnStartPoints: DataPoint[];
	isSelfLoop: boolean;
}

interface Layout {
	nodes: NodeLayout[];
	nodeMap: Map<string, NodeLayout>;
	edges: EdgeLayout[];
	maxWeight: number;
	centerX: number;
	centerY: number;
}

type HoveredElement = {
	type: 'node';
	speaker: string;
	snippetPoints: DataPoint[];
	node: NodeLayout;
} | {
	type: 'edge';
	speaker: string;
	snippetPoints: DataPoint[];
	edge: EdgeLayout;
};

// --- Geometry helpers ---

function getSelfLoopGeometry(node: NodeLayout, centerX: number, centerY: number, selfLoopRadius: number) {
	const dx = node.x - centerX;
	const dy = node.y - centerY;
	const dist = Math.sqrt(dx * dx + dy * dy);
	const outAngle = dist < 1 ? -Math.PI / 2 : Math.atan2(dy, dx);

	const loopDist = node.radius + selfLoopRadius;
	const inAngle = outAngle + Math.PI;
	const gapHalf = SELF_LOOP_GAP / 2;

	return {
		cx: node.x + Math.cos(outAngle) * loopDist,
		cy: node.y + Math.sin(outAngle) * loopDist,
		arcStart: inAngle + gapHalf,
		arcStop: inAngle + Math.PI * 2 - gapHalf,
		radius: selfLoopRadius
	};
}

function getCurvedEdgeGeometry(fromNode: NodeLayout, toNode: NodeLayout) {
	const dx = toNode.x - fromNode.x;
	const dy = toNode.y - fromNode.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist === 0) return null;

	const ux = dx / dist;
	const uy = dy / dist;

	const startX = fromNode.x + ux * fromNode.radius;
	const startY = fromNode.y + uy * fromNode.radius;
	const endX = toNode.x - ux * toNode.radius;
	const endY = toNode.y - uy * toNode.radius;
	const curveOffset = dist * CURVE_OFFSET_FACTOR;

	return {
		startX, startY, endX, endY,
		cpX: (startX + endX) / 2 + -uy * curveOffset,
		cpY: (startY + endY) / 2 + ux * curveOffset
	};
}

// --- Main class ---

export class TurnNetwork {
	private sk: p5;
	private bounds: Bounds;
	private userMap: Map<string, User>;
	private selfLoopRadius: number;
	private minDim: number;
	private config: ConfigStoreType;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.userMap = new Map(get(UserStore).map((u) => [u.name, u]));
		this.config = get(ConfigStore);
		this.minDim = Math.min(bounds.width, bounds.height);
		this.selfLoopRadius = Math.max(15, this.minDim * SELF_LOOP_RADIUS_RATIO);
	}

	draw(data: NetworkData): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null; edgeTurns: number[] | null } {
		const layout = this.buildLayout(data);
		const hovered = this.findHovered(layout);

		const hl = this.config.dashboardHighlightSpeaker;
		const hlTurns = this.config.dashboardHighlightAllTurns;
		const mouseInPanel = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
		const crossHighlightActive = this.config.dashboardToggle && (hl != null || hlTurns != null) && !mouseInPanel;

		for (const edge of layout.edges) {
			const shouldDim = crossHighlightActive && (
				(hlTurns != null && !edge.turnStartPoints.some((p) => hlTurns.includes(p.turnNumber))) ||
				(hl != null && edge.from !== hl && edge.to !== hl)
			);
			withDimming(this.sk.drawingContext, shouldDim, () => {
				this.drawEdge(edge, layout, false);
			});
		}
		for (const node of layout.nodes) {
			const shouldDim = crossHighlightActive && (
				(hlTurns != null && !node.turnStartPoints.some((p) => hlTurns.includes(p.turnNumber))) ||
				(hl != null && node.speaker !== hl)
			);
			withDimming(this.sk.drawingContext, shouldDim, () => {
				this.drawNode(node, false);
			});
		}

		if (hovered) {
			this.sk.noStroke();
			this.sk.fill(255, OVERLAY_OPACITY);
			this.sk.rect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
			this.drawHighlighted(hovered, layout);
			this.showTooltipFor(hovered, layout);
		}

		const edgeTurns = hovered?.type === 'edge'
			? hovered.edge.turnStartPoints.flatMap((p) => [p.turnNumber - 1, p.turnNumber])
			: null;
		return { snippetPoints: hovered?.snippetPoints ?? [], hoveredSpeaker: hovered?.speaker ?? null, edgeTurns };
	}

	// --- Layout ---

	private buildLayout(data: NetworkData): Layout {
		const centerX = this.bounds.x + this.bounds.width / 2;
		const centerY = this.bounds.y + this.bounds.height / 2 + this.selfLoopRadius;

		const speakers = Array.from(data.speakerStats.keys()).filter(
			(s) => this.userMap.get(s)?.enabled
		);
		if (speakers.length === 0) {
			return { nodes: [], nodeMap: new Map(), edges: [], maxWeight: 0, centerX, centerY };
		}

		let maxWordCount = 0;
		for (const stats of data.speakerStats.values()) {
			if (stats.wordCount > maxWordCount) maxWordCount = stats.wordCount;
		}

		const layoutRadius = this.minDim * LAYOUT_RADIUS_FACTOR;
		const minNodeRadius = Math.max(15, this.minDim * MIN_NODE_RADIUS_RATIO);
		const maxNodeRadius = Math.max(25, this.minDim * MAX_NODE_RADIUS_RATIO);
		const nodes: NodeLayout[] = [];
		const nodeMap = new Map<string, NodeLayout>();

		for (let i = 0; i < speakers.length; i++) {
			const speaker = speakers[i];
			const stats = data.speakerStats.get(speaker)!;
			const angle = (i / speakers.length) * Math.PI * 2 - Math.PI / 2;
			const node: NodeLayout = {
				speaker,
				x: speakers.length === 1 ? centerX : centerX + Math.cos(angle) * layoutRadius,
				y: speakers.length === 1 ? centerY : centerY + Math.sin(angle) * layoutRadius,
				radius: this.sk.map(stats.wordCount, 0, maxWordCount, minNodeRadius, maxNodeRadius, true),
				user: this.userMap.get(speaker),
				turnStartPoints: stats.turnStartPoints
			};
			nodes.push(node);
			nodeMap.set(speaker, node);
		}

		let edges: EdgeLayout[] = [];
		for (const [from, targets] of data.transitions) {
			for (const [to, d] of targets) {
				if (!this.userMap.get(from)?.enabled || !this.userMap.get(to)?.enabled) continue;
				edges.push({ from, to, count: d.count, wordCount: d.wordCount, weight: 0, turnStartPoints: d.turnStartPoints, isSelfLoop: from === to });
			}
		}

		if (this.config.turnNetworkHideSelfLoops) {
			edges = edges.filter((e) => !e.isSelfLoop);
		}
		if (this.config.turnNetworkMinTransitions > 1) {
			edges = edges.filter((e) => e.count >= this.config.turnNetworkMinTransitions);
		}

		const weightByWords = this.config.turnNetworkWeightByWords;
		let maxWeight = 0;
		for (const edge of edges) {
			edge.weight = weightByWords ? edge.wordCount : edge.count;
			if (edge.weight > maxWeight) maxWeight = edge.weight;
		}

		return { nodes, nodeMap, edges, maxWeight, centerX, centerY };
	}

	// --- Drawing ---

	private drawNode(node: NodeLayout, highlight: boolean): void {
		const color = node.user?.color || DEFAULT_SPEAKER_COLOR;
		const fillColor = this.sk.color(color);
		fillColor.setAlpha(highlight ? 255 : 200);

		this.sk.noStroke();
		this.sk.fill(fillColor);
		this.sk.ellipse(node.x, node.y, node.radius * 2);

		this.sk.noFill();
		this.sk.stroke(color);
		this.sk.strokeWeight(highlight ? 3 : 2);
		this.sk.ellipse(node.x, node.y, node.radius * 2);

		this.sk.noStroke();
		this.sk.fill(255);
		this.sk.textSize(Math.max(8, this.minDim * NODE_LABEL_RATIO));
		this.sk.textAlign(this.sk.CENTER, this.sk.CENTER);
		this.sk.text(this.truncateLabel(node.speaker, node.radius * 1.6), node.x, node.y);
	}

	private drawEdge(edge: EdgeLayout, layout: Layout, highlight: boolean): void {
		const fromNode = layout.nodeMap.get(edge.from);
		const toNode = layout.nodeMap.get(edge.to);
		if (!fromNode || !toNode) return;

		const edgeColor = this.sk.color(fromNode.user?.color || DEFAULT_SPEAKER_COLOR);
		edgeColor.setAlpha(highlight ? 255 : 150);
		const weight = this.edgeWeight(edge.weight, layout.maxWeight) + (highlight ? 1 : 0);

		this.sk.stroke(edgeColor);
		this.sk.strokeWeight(weight);
		this.sk.noFill();

		if (edge.isSelfLoop) {
			const loop = getSelfLoopGeometry(fromNode, layout.centerX, layout.centerY, this.selfLoopRadius);
			this.sk.arc(loop.cx, loop.cy, loop.radius * 2, loop.radius * 2, loop.arcStart, loop.arcStop);

			const endX = loop.cx + loop.radius * Math.cos(loop.arcStop);
			const endY = loop.cy + loop.radius * Math.sin(loop.arcStop);
			const tanX = -Math.sin(loop.arcStop);
			const tanY = Math.cos(loop.arcStop);
			this.drawArrowhead(endX - tanX * ARROW_SIZE, endY - tanY * ARROW_SIZE, endX, endY, edgeColor, weight);
		} else {
			const geom = getCurvedEdgeGeometry(fromNode, toNode);
			if (!geom) return;

			this.sk.beginShape();
			this.sk.vertex(geom.startX, geom.startY);
			this.sk.quadraticVertex(geom.cpX, geom.cpY, geom.endX, geom.endY);
			this.sk.endShape();

			this.drawArrowhead(geom.cpX, geom.cpY, geom.endX, geom.endY, edgeColor, weight);

			// Edge count label at bezier midpoint
			const lx = 0.25 * geom.startX + 0.5 * geom.cpX + 0.25 * geom.endX;
			const ly = 0.25 * geom.startY + 0.5 * geom.cpY + 0.25 * geom.endY;
			this.sk.noStroke();
			this.sk.fill(255, 200);
			this.sk.rect(lx - 10, ly - 7, 20, 14, 3);
			this.sk.fill(80);
			this.sk.textSize(Math.max(7, this.minDim * EDGE_LABEL_RATIO));
			this.sk.textAlign(this.sk.CENTER, this.sk.CENTER);
			this.sk.text(String(edge.weight), lx, ly);
		}
	}

	private drawArrowhead(fromX: number, fromY: number, toX: number, toY: number, color: p5.Color, weight: number): void {
		const angle = Math.atan2(toY - fromY, toX - fromX);
		const size = ARROW_SIZE + weight * 0.5;
		this.sk.fill(color);
		this.sk.noStroke();
		this.sk.beginShape();
		this.sk.vertex(toX, toY);
		this.sk.vertex(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
		this.sk.vertex(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
		this.sk.endShape(this.sk.CLOSE);
	}

	private drawHighlighted(hovered: HoveredElement, layout: Layout): void {
		if (hovered.type === 'node') {
			for (const edge of layout.edges) {
				if (edge.from === hovered.speaker || edge.to === hovered.speaker) {
					this.drawEdge(edge, layout, true);
				}
			}
			this.drawNode(hovered.node, true);
		} else {
			this.drawEdge(hovered.edge, layout, true);
			const fromNode = layout.nodeMap.get(hovered.edge.from);
			const toNode = layout.nodeMap.get(hovered.edge.to);
			if (fromNode) this.drawNode(fromNode, true);
			if (toNode && toNode !== fromNode) this.drawNode(toNode, true);
		}
	}

	private edgeWeight(weight: number, maxWeight: number): number {
		return this.sk.map(weight, 1, Math.max(maxWeight, 1), MIN_EDGE_WIDTH, MAX_EDGE_WIDTH, true);
	}

	private truncateLabel(text: string, maxWidth: number): string {
		if (this.sk.textWidth(text) <= maxWidth) return text;
		let t = text;
		while (t.length > 0 && this.sk.textWidth(t + '..') > maxWidth) t = t.slice(0, -1);
		return t.length > 0 ? t + '..' : '';
	}

	// --- Hover detection ---

	private findHovered(layout: Layout): HoveredElement | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}
		const mx = this.sk.mouseX;
		const my = this.sk.mouseY;

		for (const node of layout.nodes) {
			const dx = mx - node.x;
			const dy = my - node.y;
			if (dx * dx + dy * dy <= node.radius * node.radius) {
				return { type: 'node', speaker: node.speaker, snippetPoints: node.turnStartPoints, node };
			}
		}

		for (const edge of layout.edges) {
			if (this.isNearEdge(mx, my, edge, layout)) {
				return { type: 'edge', speaker: edge.from, snippetPoints: edge.turnStartPoints, edge };
			}
		}

		return null;
	}

	private isNearEdge(mx: number, my: number, edge: EdgeLayout, layout: Layout): boolean {
		const fromNode = layout.nodeMap.get(edge.from);
		const toNode = layout.nodeMap.get(edge.to);
		if (!fromNode || !toNode) return false;

		if (edge.isSelfLoop) {
			const loop = getSelfLoopGeometry(fromNode, layout.centerX, layout.centerY, this.selfLoopRadius);
			const dist = Math.sqrt((mx - loop.cx) ** 2 + (my - loop.cy) ** 2);
			return Math.abs(dist - loop.radius) < EDGE_HIT_TOLERANCE;
		}

		const geom = getCurvedEdgeGeometry(fromNode, toNode);
		if (!geom) return false;

		for (let t = 0; t <= 1; t += 0.1) {
			const mt = 1 - t;
			const px = mt * mt * geom.startX + 2 * mt * t * geom.cpX + t * t * geom.endX;
			const py = mt * mt * geom.startY + 2 * mt * t * geom.cpY + t * t * geom.endY;
			if ((mx - px) ** 2 + (my - py) ** 2 < EDGE_HIT_TOLERANCE_SQ) return true;
		}

		return false;
	}

	// --- Tooltips ---

	private showTooltipFor(hovered: HoveredElement, layout: Layout): void {
		const color = this.userMap.get(hovered.speaker)?.color || DEFAULT_SPEAKER_COLOR;
		let content: string;

		const unit = this.config.turnNetworkWeightByWords ? 'word' : 'transition';
		const plural = (n: number) => `${n} ${unit}${n !== 1 ? 's' : ''}`;

		if (hovered.type === 'node') {
			let initiated = 0;
			let received = 0;
			for (const edge of layout.edges) {
				if (edge.from === hovered.speaker) initiated += edge.weight;
				if (edge.to === hovered.speaker) received += edge.weight;
			}
			content =
				`<b>${hovered.speaker}</b>\n` +
				`<span style="font-size: 0.85em; opacity: 0.7">` +
				`Initiated ${plural(initiated)}  ·  Received ${plural(received)}</span>`;
		} else {
			content =
				`<b>${hovered.edge.from} → ${hovered.edge.to}</b>\n` +
				`<span style="font-size: 0.85em; opacity: 0.7">${plural(hovered.edge.weight)}</span>`;
		}

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, color, this.bounds.y + this.bounds.height);
	}
}
