/**
 * Speaker-Time Heatmap Visualization
 *
 * A grid where time buckets are on the x-axis, speakers on the y-axis,
 * and cell color intensity represents word count. A compact birds-eye view
 * showing who speaks when.
 *
 * Performance: Uses an offscreen buffer that only re-renders when data changes.
 * Hover effects are drawn on top of the cached buffer each frame.
 */

import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import { binWordsByTime, type BinnedData } from '../core/binning-utils';

const LEFT_MARGIN = 100;
const BOTTOM_MARGIN = 30;
const CELL_PADDING = 1;
const MIN_OPACITY = 10;
const MAX_OPACITY = 230;
const HOVER_OUTLINE_WEIGHT = 2;
const TIME_LABEL_COUNT = 6;

let bufferCache: {
	buffer: p5.Graphics | null;
	cacheKey: string | null;
	binnedData: BinnedData | null;
	speakerOrder: string[];
} = {
	buffer: null,
	cacheKey: null,
	binnedData: null,
	speakerOrder: []
};

export function clearHeatmapBuffer(): void {
	if (bufferCache.buffer) {
		bufferCache.buffer.remove();
	}
	bufferCache = { buffer: null, cacheKey: null, binnedData: null, speakerOrder: [] };
}

export class SpeakerHeatmap {
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

	draw(binnedData: BinnedData, speakers: string[]): { hoveredCell: DataPoint | null } {
		const cacheKey = this.getCacheKey(binnedData.bins.length, speakers);

		if (cacheKey !== bufferCache.cacheKey || !bufferCache.buffer) {
			this.renderToBuffer(binnedData, speakers);
			bufferCache.cacheKey = cacheKey;
			bufferCache.binnedData = binnedData;
			bufferCache.speakerOrder = speakers;
		}

		this.sk.image(bufferCache.buffer!, this.bounds.x, this.bounds.y);

		const hovered = this.findHoveredCell();
		if (hovered) {
			this.drawHoverEffect(hovered);
			this.showCellTooltip(hovered);
		}

		return { hoveredCell: hovered?.dataPoint || null };
	}

	getCacheKey(binCount: number, speakers: string[]): string {
		const userStates = this.users.map((u) => `${u.name}:${u.color}:${u.enabled}`).join(',');
		const timeline = get(TimelineStore);
		return [
			this.bounds.width,
			this.bounds.height,
			binCount,
			speakers.join(','),
			timeline.leftMarker,
			timeline.rightMarker,
			userStates
		].join('|');
	}

	renderToBuffer(binnedData: BinnedData, speakers: string[]): void {
		if (bufferCache.buffer) {
			bufferCache.buffer.remove();
		}

		const buffer = this.sk.createGraphics(this.bounds.width, this.bounds.height);
		buffer.textFont(this.sk.font);

		const gridBounds = this.getGridBounds();
		const numBins = binnedData.bins.length;
		const numSpeakers = speakers.length;
		if (numBins === 0 || numSpeakers === 0) {
			bufferCache.buffer = buffer;
			return;
		}

		const cellWidth = gridBounds.width / numBins;
		const cellHeight = gridBounds.height / numSpeakers;

		// Draw speaker labels
		buffer.textSize(Math.min(12, cellHeight * 0.7));
		buffer.textAlign(buffer.RIGHT, buffer.CENTER);
		buffer.noStroke();
		for (let row = 0; row < numSpeakers; row++) {
			const speaker = speakers[row];
			const user = this.userMap.get(speaker);
			const y = gridBounds.y + row * cellHeight + cellHeight / 2;
			buffer.fill(user?.enabled ? (user.color as string) : '#cccccc');
			const label = this.truncateLabel(speaker, LEFT_MARGIN - 10, buffer);
			buffer.text(label, LEFT_MARGIN - 8, y);
		}

		// Draw cells
		for (let col = 0; col < numBins; col++) {
			const bin = binnedData.bins[col];
			for (let row = 0; row < numSpeakers; row++) {
				const speaker = speakers[row];
				const user = this.userMap.get(speaker);
				const count = bin.speakers[speaker]?.count || 0;

				const x = gridBounds.x + col * cellWidth + CELL_PADDING;
				const y = gridBounds.y + row * cellHeight + CELL_PADDING;
				const w = cellWidth - CELL_PADDING * 2;
				const h = cellHeight - CELL_PADDING * 2;

				if (count > 0 && user?.enabled) {
					const alpha = this.sk.map(count, 0, binnedData.maxCellCount, MIN_OPACITY, MAX_OPACITY);
					const c = buffer.color(user.color);
					c.setAlpha(alpha);
					buffer.noStroke();
					buffer.fill(c);
					buffer.rect(x, y, w, h);
				} else {
					buffer.noStroke();
					buffer.fill(245);
					buffer.rect(x, y, w, h);
				}
			}
		}

		// Draw time labels
		const timeline = get(TimelineStore);
		const transcript = get(TranscriptStore);
		const isUntimed = transcript.timingMode === 'untimed';
		buffer.textSize(10);
		buffer.textAlign(buffer.CENTER, buffer.TOP);
		buffer.fill(120);
		const labelStep = Math.max(1, Math.floor(numBins / TIME_LABEL_COUNT));
		for (let col = 0; col < numBins; col += labelStep) {
			const bin = binnedData.bins[col];
			const x = gridBounds.x + col * cellWidth + cellWidth / 2;
			const y = gridBounds.y + gridBounds.height + 5;
			const label = isUntimed ? String(Math.round(bin.startTime)) : formatTimeCompact(bin.startTime);
			buffer.text(label, x, y);
		}
		// Always label the end
		if (numBins > 0) {
			const lastBin = binnedData.bins[numBins - 1];
			const x = gridBounds.x + gridBounds.width;
			const y = gridBounds.y + gridBounds.height + 5;
			const label = isUntimed ? String(Math.round(lastBin.endTime)) : formatTimeCompact(lastBin.endTime);
			buffer.textAlign(buffer.RIGHT, buffer.TOP);
			buffer.text(label, x, y);
		}

		bufferCache.buffer = buffer;
	}

	getGridBounds(): Bounds {
		return {
			x: LEFT_MARGIN,
			y: 0,
			width: this.bounds.width - LEFT_MARGIN,
			height: this.bounds.height - BOTTOM_MARGIN
		};
	}

	truncateLabel(text: string, maxWidth: number, buffer: p5.Graphics): string {
		if (buffer.textWidth(text) <= maxWidth) return text;
		let truncated = text;
		while (truncated.length > 0 && buffer.textWidth(truncated + '...') > maxWidth) {
			truncated = truncated.slice(0, -1);
		}
		return truncated + '...';
	}

	findHoveredCell(): { col: number; row: number; dataPoint: DataPoint | null; speaker: string; count: number; bin: number } | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const binnedData = bufferCache.binnedData;
		const speakers = bufferCache.speakerOrder;
		if (!binnedData || binnedData.bins.length === 0 || speakers.length === 0) return null;

		const gridBounds = this.getGridBounds();
		const localX = this.sk.mouseX - this.bounds.x - gridBounds.x;
		const localY = this.sk.mouseY - this.bounds.y - gridBounds.y;

		if (localX < 0 || localX >= gridBounds.width || localY < 0 || localY >= gridBounds.height) {
			return null;
		}

		const cellWidth = gridBounds.width / binnedData.bins.length;
		const cellHeight = gridBounds.height / speakers.length;

		const col = Math.floor(localX / cellWidth);
		const row = Math.floor(localY / cellHeight);

		if (col < 0 || col >= binnedData.bins.length || row < 0 || row >= speakers.length) {
			return null;
		}

		const speaker = speakers[row];
		const bin = binnedData.bins[col];
		const cellData = bin.speakers[speaker];
		const user = this.userMap.get(speaker);

		if (!user?.enabled) return null;

		return {
			col,
			row,
			dataPoint: cellData?.firstDataPoint || null,
			speaker,
			count: cellData?.count || 0,
			bin: col
		};
	}

	drawHoverEffect(hovered: { col: number; row: number; speaker: string; count: number }): void {
		const binnedData = bufferCache.binnedData!;
		const speakers = bufferCache.speakerOrder;
		const gridBounds = this.getGridBounds();

		const cellWidth = gridBounds.width / binnedData.bins.length;
		const cellHeight = gridBounds.height / speakers.length;

		const x = this.bounds.x + gridBounds.x + hovered.col * cellWidth;
		const y = this.bounds.y + gridBounds.y + hovered.row * cellHeight;
		const w = cellWidth;
		const h = cellHeight;

		const user = this.userMap.get(hovered.speaker);
		const color = user?.color || '#cccccc';

		this.sk.noFill();
		this.sk.stroke(color);
		this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.sk.rect(x, y, w, h);
	}

	showCellTooltip(hovered: { col: number; row: number; speaker: string; count: number }): void {
		const binnedData = bufferCache.binnedData!;
		const bin = binnedData.bins[hovered.col];
		const user = this.userMap.get(hovered.speaker);

		const transcript = get(TranscriptStore);
		const isUntimed = transcript.timingMode === 'untimed';

		const timeRange = isUntimed
			? `Words ${Math.round(bin.startTime)}-${Math.round(bin.endTime)}`
			: `${formatTimeCompact(bin.startTime)} - ${formatTimeCompact(bin.endTime)}`;

		const content = `<b>${hovered.speaker}</b>: ${hovered.count} word${hovered.count !== 1 ? 's' : ''}\n<span style="font-size: 0.85em; opacity: 0.7">${timeRange}</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || '#cccccc', this.sk.height);
	}
}
