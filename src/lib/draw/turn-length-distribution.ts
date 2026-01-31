/**
 * Turn Length Distribution Visualization
 *
 * Histogram showing how turn lengths (word counts) are distributed,
 * colored by speaker. Reveals whether conversations are dominated
 * by long monologues or short exchanges.
 *
 * Performance: Uses an offscreen buffer that only re-renders when data changes.
 * Hover effects are drawn on top of the cached buffer each frame.
 */

import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import type { TurnLengthData } from '../core/dynamic-data';

const LEFT_MARGIN = 60;
const BOTTOM_MARGIN = 40;
const BAR_PADDING = 2;
const HOVER_OUTLINE_WEIGHT = 2;

let bufferCache: {
	buffer: p5.Graphics | null;
	cacheKey: string | null;
	data: TurnLengthData | null;
} = { buffer: null, cacheKey: null, data: null };

export function clearTurnLengthBuffer(): void {
	if (bufferCache.buffer) bufferCache.buffer.remove();
	bufferCache = { buffer: null, cacheKey: null, data: null };
}

export class TurnLengthDistribution {
	sk: p5;
	bounds: Bounds;
	users: User[];
	userMap: Map<string, User>;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.users = get(UserStore);
		this.userMap = new Map(this.users.map((u) => [u.name, u]));
	}

	draw(data: TurnLengthData): { hoveredBar: DataPoint | null } {
		const cacheKey = this.getCacheKey(data);

		if (cacheKey !== bufferCache.cacheKey || !bufferCache.buffer) {
			this.renderToBuffer(data);
			bufferCache.cacheKey = cacheKey;
			bufferCache.data = data;
		}

		this.sk.image(bufferCache.buffer!, this.bounds.x, this.bounds.y);

		const hovered = this.findHoveredSegment();
		if (hovered) {
			this.drawHoverEffect(hovered);
			this.showSegmentTooltip(hovered);
		}

		return { hoveredBar: hovered?.dataPoint || null };
	}

	getCacheKey(data: TurnLengthData): string {
		const userStates = this.users.map((u) => `${u.name}:${u.color}:${u.enabled}`).join(',');
		const binKey = data.bins.map((b) => {
			const counts = Object.entries(b.speakers).map(([s, d]) => `${s}:${d.count}`).join(';');
			return `${b.minLength}-${b.maxLength}:${counts}`;
		}).join(',');
		return [this.bounds.width, this.bounds.height, binKey, userStates].join('|');
	}

	renderToBuffer(data: TurnLengthData): void {
		if (bufferCache.buffer) bufferCache.buffer.remove();

		const buffer = this.sk.createGraphics(this.bounds.width, this.bounds.height);
		buffer.textFont(this.sk.font);

		const grid = this.getGridBounds();
		const { bins, maxCount, speakers } = data;

		if (bins.length === 0 || maxCount === 0) {
			bufferCache.buffer = buffer;
			return;
		}

		const barWidth = grid.width / bins.length;

		// Draw y-axis labels
		buffer.textSize(10);
		buffer.textAlign(buffer.RIGHT, buffer.CENTER);
		buffer.fill(120);
		buffer.noStroke();
		const yTicks = 5;
		for (let i = 0; i <= yTicks; i++) {
			const val = Math.round((i / yTicks) * maxCount);
			const y = grid.y + grid.height - (i / yTicks) * grid.height;
			buffer.text(String(val), LEFT_MARGIN - 8, y);
			// Grid line
			buffer.stroke(240);
			buffer.strokeWeight(1);
			buffer.line(grid.x, y, grid.x + grid.width, y);
			buffer.noStroke();
		}

		// Draw stacked bars
		for (let b = 0; b < bins.length; b++) {
			const bin = bins[b];
			const x = grid.x + b * barWidth + BAR_PADDING;
			const w = barWidth - BAR_PADDING * 2;
			let yOffset = 0;

			for (const speaker of speakers) {
				const entry = bin.speakers[speaker];
				if (!entry || entry.count === 0) continue;
				const user = this.userMap.get(speaker);
				if (!user?.enabled) continue;

				const h = (entry.count / maxCount) * grid.height;
				const y = grid.y + grid.height - yOffset - h;

				const c = buffer.color(user.color);
				c.setAlpha(200);
				buffer.noStroke();
				buffer.fill(c);
				buffer.rect(x, y, w, h, 1);

				yOffset += h;
			}
		}

		// Draw x-axis labels
		buffer.textSize(10);
		buffer.fill(120);
		buffer.noStroke();
		const labelInterval = Math.max(1, Math.floor(bins.length / 10));
		for (let b = 0; b < bins.length; b += labelInterval) {
			const bin = bins[b];
			const x = grid.x + b * barWidth + barWidth / 2;
			const y = grid.y + grid.height + 5;
			buffer.textAlign(buffer.CENTER, buffer.TOP);
			const label = bin.minLength === bin.maxLength ? String(bin.minLength) : `${bin.minLength}-${bin.maxLength}`;
			buffer.text(label, x, y);
		}

		// Axis label
		buffer.textSize(11);
		buffer.textAlign(buffer.CENTER, buffer.TOP);
		buffer.fill(100);
		buffer.text('Words per turn', grid.x + grid.width / 2, grid.y + grid.height + 22);

		bufferCache.buffer = buffer;
	}

	getGridBounds(): Bounds {
		return {
			x: LEFT_MARGIN,
			y: 10,
			width: this.bounds.width - LEFT_MARGIN - 10,
			height: this.bounds.height - BOTTOM_MARGIN - 10
		};
	}

	findHoveredSegment(): { binIndex: number; speaker: string; dataPoint: DataPoint; y: number; h: number } | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) return null;

		const data = bufferCache.data;
		if (!data || data.bins.length === 0 || data.maxCount === 0) return null;

		const grid = this.getGridBounds();
		const localX = this.sk.mouseX - this.bounds.x - grid.x;
		const localY = this.sk.mouseY - this.bounds.y - grid.y;

		if (localX < 0 || localX >= grid.width || localY < 0 || localY >= grid.height) return null;

		const barWidth = grid.width / data.bins.length;
		const binIndex = Math.floor(localX / barWidth);
		if (binIndex < 0 || binIndex >= data.bins.length) return null;

		const bin = data.bins[binIndex];
		let yOffset = 0;

		for (const speaker of data.speakers) {
			const entry = bin.speakers[speaker];
			if (!entry || entry.count === 0) continue;
			const user = this.userMap.get(speaker);
			if (!user?.enabled) continue;

			const h = (entry.count / data.maxCount) * grid.height;
			const y = grid.height - yOffset - h;

			if (localY >= y && localY <= y + h && entry.firstDataPoint) {
				return { binIndex, speaker, dataPoint: entry.firstDataPoint, y, h };
			}

			yOffset += h;
		}

		return null;
	}

	drawHoverEffect(hovered: { binIndex: number; speaker: string; y: number; h: number }): void {
		const data = bufferCache.data!;
		const grid = this.getGridBounds();
		const barWidth = grid.width / data.bins.length;

		const x = this.bounds.x + grid.x + hovered.binIndex * barWidth + BAR_PADDING;
		const w = barWidth - BAR_PADDING * 2;
		const y = this.bounds.y + grid.y + hovered.y;
		const h = hovered.h;

		const user = this.userMap.get(hovered.speaker);
		this.sk.noFill();
		this.sk.stroke(user?.color || '#cccccc');
		this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.sk.rect(x, y, w, h, 1);
	}

	showSegmentTooltip(hovered: { binIndex: number; speaker: string; dataPoint: DataPoint }): void {
		const data = bufferCache.data!;
		const bin = data.bins[hovered.binIndex];
		const entry = bin.speakers[hovered.speaker];
		const user = this.userMap.get(hovered.speaker);

		const range = bin.minLength === bin.maxLength ? `${bin.minLength} words` : `${bin.minLength}-${bin.maxLength} words`;
		const content = `<b>${hovered.speaker}</b>\n<span style="font-size: 0.85em; opacity: 0.7">${range}  ·  ${entry.count} turn${entry.count !== 1 ? 's' : ''}</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || '#cccccc', this.sk.height);
	}
}
