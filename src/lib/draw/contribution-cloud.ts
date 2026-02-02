/**
 * Contribution Cloud Visualization
 *
 * Renders a word cloud where each word from the transcript is displayed.
 * Word size reflects frequency (repeated words appear larger).
 * Words are colored by speaker and can be separated by speaker.
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
import { normalizeWord } from '../core/string-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import { calculateScaling, getWordWidth, type Scaling } from './contribution-cloud-scaling';
import { DEFAULT_SPEAKER_COLOR } from '../constants/ui';

export { clearScalingCache } from './contribution-cloud-scaling';

interface WordPosition {
	word: DataPoint;
	x: number;
	y: number;
	textSize: number;
	width: number;
	ascent: number;
	descent: number;
	user: User | undefined;
	isNewSpeaker: boolean;
}

const HOVER_OUTLINE_WEIGHT = 2;
const MAX_TOOLTIP_LENGTH = 300;
const OVERLAY_OPACITY = 200;

let bufferCache: {
	buffer: p5.Graphics | null;
	positions: WordPosition[];
	cacheKey: string | null;
	hasOverflow: boolean;
} = {
	buffer: null,
	positions: [],
	cacheKey: null,
	hasOverflow: false
};

export function clearCloudBuffer(): void {
	if (bufferCache.buffer) {
		bufferCache.buffer.remove();
	}
	bufferCache = { buffer: null, positions: [], cacheKey: null, hasOverflow: false };
}

export class ContributionCloud {
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

	draw(words: DataPoint[]): { hoveredWord: DataPoint | null; hasOverflow: boolean; hoveredSpeaker: string | null } {
		const layoutWords = words.filter((w) => this.isWordVisible(w));
		const scaling = calculateScaling(this.sk, layoutWords, this.bounds, this.config);
		const cacheKey = this.getBufferCacheKey(layoutWords.length);

		if (cacheKey !== bufferCache.cacheKey || !bufferCache.buffer) {
			this.renderToBuffer(layoutWords, scaling);
			bufferCache.cacheKey = cacheKey;
		}

		this.sk.image(bufferCache.buffer!, this.bounds.x, this.bounds.y);

		const hoveredWord = this.findHoveredWord(bufferCache.positions);
		if (hoveredWord) {
			this.drawHoverEffects(hoveredWord, bufferCache.positions);
			this.showWordTooltip(hoveredWord, bufferCache.positions);
		}

		return { hoveredWord: hoveredWord?.word || null, hasOverflow: bufferCache.hasOverflow, hoveredSpeaker: hoveredWord?.word.speaker ?? null };
	}

	getBufferCacheKey(filteredWordCount: number): string {
		const userStates = this.users.map((u) => `${u.name}:${u.color}:${u.enabled}`).join(',');
		const timeline = get(TimelineStore);
		return [
			this.bounds.x,
			this.bounds.y,
			this.bounds.width,
			this.bounds.height,
			filteredWordCount,
			this.config.separateToggle,
			this.config.sortToggle,
			this.config.repeatedWordsToggle,
			this.config.repeatWordSliderValue,
			this.config.dashboardToggle,
			this.config.wordToSearch || '',
			userStates,
			timeline.leftMarker,
			timeline.rightMarker
		].join('|');
	}

	renderToBuffer(words: DataPoint[], scaling: Scaling): void {
		if (bufferCache.buffer) {
			bufferCache.buffer.remove();
		}

		const buffer = this.sk.createGraphics(this.bounds.width, this.bounds.height);
		buffer.textFont(this.sk.font);

		const positions = this.calculateWordPositions(words, scaling);
		bufferCache.positions = positions;
		bufferCache.hasOverflow = positions.length > 0 && positions[positions.length - 1].y > this.bounds.height;

		if (this.config.separateToggle) {
			this.drawSpeakerBackgrounds(buffer, positions, scaling);
		}

		for (const pos of positions) {
			buffer.textSize(pos.textSize);
			buffer.noStroke();
			pos.user?.enabled ? buffer.fill(pos.user.color) : buffer.fill(255);
			buffer.text(pos.word.word, pos.x, pos.y);
		}

		bufferCache.buffer = buffer;
	}

	calculateWordPositions(words: DataPoint[], scaling: Scaling): WordPosition[] {
		const positions: WordPosition[] = [];
		let x = 0;
		let y = scaling.lineHeight;
		let prevSpeaker: string | null = null;

		for (const word of words) {
			const textSize = this.sk.map(word.count, 1, this.config.repeatWordSliderValue, scaling.minTextSize, scaling.maxTextSize, true);
			const width = getWordWidth(this.sk, word.word, textSize);
			const isNewSpeaker = prevSpeaker !== null && word.speaker !== prevSpeaker;

			if (this.config.separateToggle && isNewSpeaker) {
				x = 0;
				y += scaling.newSpeakerGap;
			} else if (x + width > this.bounds.width) {
				x = 0;
				y += scaling.lineHeight;
			}

			if (this.passesSearchFilter(word)) {
				this.sk.textSize(textSize);
				positions.push({
					word,
					x,
					y,
					textSize,
					width,
					ascent: this.sk.textAscent(),
					descent: this.sk.textDescent(),
					user: this.userMap.get(word.speaker),
					isNewSpeaker
				});
			}

			x += getWordWidth(this.sk, word.word + ' ', textSize);
			prevSpeaker = word.speaker;
		}

		return positions;
	}

	drawSpeakerBackgrounds(buffer: p5.Graphics, positions: WordPosition[], scaling: Scaling): void {
		if (positions.length === 0) return;

		let sectionStart = 0;
		for (let i = 1; i <= positions.length; i++) {
			if (i === positions.length || positions[i].isNewSpeaker) {
				const section = positions.slice(sectionStart, i);
				const user = section[0]?.user;

				if (user?.enabled && user.color) {
					const minY = Math.min(...section.map((w) => w.y)) - scaling.lineHeight;
					const maxY = Math.max(...section.map((w) => w.y));
					const c = buffer.color(user.color);
					c.setAlpha(15);
					buffer.noStroke();
					buffer.fill(c);
					buffer.rect(-5, minY, this.bounds.width + 10, maxY - minY + 10, 5);
				}
				sectionStart = i;
			}
		}
	}

	drawHoverEffects(hoveredPos: WordPosition, positions: WordPosition[]): void {
		const hoveredWordText = hoveredPos.word.word;

		this.sk.noStroke();
		this.sk.fill(255, OVERLAY_OPACITY);
		this.sk.rect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);

		this.sk.textAlign(this.sk.LEFT, this.sk.BASELINE);
		for (const pos of positions) {
			if (normalizeWord(pos.word.word) === normalizeWord(hoveredWordText)) {
				const screenX = this.bounds.x + pos.x;
				const screenY = this.bounds.y + pos.y;
				const isHovered = pos.word === hoveredPos.word;
				const padding = isHovered ? 3 : 2;
				const color = pos.user?.color || DEFAULT_SPEAKER_COLOR;

				this.sk.textSize(pos.textSize);
				this.sk.noStroke();
				this.sk.fill(color);
				this.sk.text(pos.word.word, screenX, screenY);

				this.sk.noFill();
				this.sk.stroke(color);
				this.sk.strokeWeight(isHovered ? HOVER_OUTLINE_WEIGHT : 1);
				this.sk.rect(screenX - padding, screenY - pos.ascent - padding, pos.width + padding * 2, pos.ascent + pos.descent + padding * 2, isHovered ? 4 : 3);
			}
		}
	}

	findHoveredWord(positions: WordPosition[]): WordPosition | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}
		for (const pos of positions) {
			if (pos.user?.enabled) {
				const screenX = this.bounds.x + pos.x;
				const screenY = this.bounds.y + pos.y;
				if (this.sk.overRect(screenX, screenY - pos.ascent, pos.width, pos.ascent + pos.descent)) {
					return pos;
				}
			}
		}
		return null;
	}

	showWordTooltip(pos: WordPosition, allPositions: WordPosition[]): void {
		const { word, user } = pos;
		const turnContext = this.getTurnContext(word, allPositions);
		let totalCount = 1;
		for (const p of allPositions) {
			if (normalizeWord(p.word.word) === normalizeWord(word.word) && p.word.speaker === word.speaker && p.word.count > totalCount) {
				totalCount = p.word.count;
			}
		}

		let content = `<b>${word.speaker}:</b> ${turnContext || word.displayWord}`;

		const details = [`×${totalCount}`, `Turn ${word.turnNumber}`];
		const transcript = get(TranscriptStore);
		if (transcript.timingMode !== 'untimed' && word.startTime != null) {
			details.push(formatTimeCompact(word.startTime));
		}

		content += `\n<span style="font-size: 0.85em; opacity: 0.7">${details.join('  ·  ')}</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || DEFAULT_SPEAKER_COLOR, this.bounds.y + this.bounds.height);
	}

	getTurnContext(word: DataPoint, allPositions: WordPosition[]): string | null {
		const turnPositions = allPositions
			.filter((p) => p.word.turnNumber === word.turnNumber)
			.sort((a, b) => a.word.startTime - b.word.startTime);

		if (turnPositions.length === 0) return null;

		const hoveredIndex = turnPositions.findIndex((p) => p.word === word);
		const parts = turnPositions.map((p, i) => (i === hoveredIndex ? `<b>${p.word.displayWord}</b>` : p.word.displayWord));

		let sentence = parts.join(' ');
		if (sentence.length > MAX_TOOLTIP_LENGTH && hoveredIndex >= 0) {
			const start = Math.max(0, hoveredIndex - 8);
			const end = Math.min(parts.length, hoveredIndex + 12);
			sentence = (start > 0 ? '... ' : '') + parts.slice(start, end).join(' ') + (end < parts.length ? ' ...' : '');
		}

		return sentence;
	}

	isWordVisible(word: DataPoint): boolean {
		const user = this.userMap.get(word.speaker);
		if (user && !user.enabled) return false;
		if (this.config.dashboardToggle) {
			const mouseInPanel = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
			if (!mouseInPanel && !this.sk.shouldDraw(word)) return false;
		}
		if (this.config.repeatedWordsToggle && word.count < this.config.repeatWordSliderValue) return false;
		return true;
	}

	passesSearchFilter(word: DataPoint): boolean {
		return !this.config.wordToSearch || normalizeWord(word.word).includes(normalizeWord(this.config.wordToSearch));
	}
}
