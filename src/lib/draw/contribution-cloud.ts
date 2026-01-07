/**
 * Contribution Cloud Visualization
 *
 * Renders a word cloud with time where each word from the transcript is displayed.
 * Word size reflects frequency (repeated words appear larger).
 * Words are colored by speaker and can be separated by speaker.
 *
 * This file handles:
 * - Word positioning and layout
 * - Drawing words with hover effects
 * - Speaker background highlighting
 * - Tooltips on hover
 *
 * Scaling calculations (how big to make text to fit the available space)
 * are handled by contribution-cloud-scaling.ts, which also manages caching
 * to avoid recalculating every frame.
 */

import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import TranscriptStore from '../../stores/transcriptStore';
import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import { calculateScaling, getWordWidth, type Scaling } from './contribution-cloud-scaling';

// Re-export for external use
export { clearScalingCache } from './contribution-cloud-scaling';

interface WordPosition {
	word: DataPoint;
	x: number;
	y: number;
	textSize: number;
	width: number;
	user: User | undefined;
	isNewSpeaker: boolean;
}

// Hover effect constants
const HOVER_SCALE = 1.15;
const HOVER_OUTLINE_WEIGHT = 2;
const MAX_TOOLTIP_LENGTH = 300;

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

	draw(words: DataPoint[]): { hoveredWord: DataPoint | null } {
		const layoutWords = words.filter((w) => this.isWordVisible(w));
		const scaling = calculateScaling(this.sk, layoutWords, this.bounds, this.config);
		const wordPositions = this.calculateWordPositions(layoutWords, scaling);

		if (this.config.separateToggle) {
			this.drawSpeakerBackgrounds(wordPositions, scaling);
		}

		const hoveredWord = this.findHoveredWord(wordPositions, scaling);

		for (const pos of wordPositions) {
			this.drawWord(pos, hoveredWord, scaling);
		}

		if (hoveredWord) {
			this.showWordTooltip(hoveredWord, wordPositions);
		}

		return { hoveredWord: hoveredWord?.word || null };
	}

	calculateWordPositions(words: DataPoint[], scaling: Scaling): WordPosition[] {
		const positions: WordPosition[] = [];
		let x = this.bounds.x;
		let y = this.bounds.y + scaling.lineHeight;
		let prevSpeaker: string | null = null;

		for (const word of words) {
			const textSize = this.sk.map(word.count, 1, this.config.repeatWordSliderValue, scaling.minTextSize, scaling.maxTextSize, true);
			const width = getWordWidth(this.sk, word.word, textSize);

			if (this.config.separateToggle && prevSpeaker !== null && word.speaker !== prevSpeaker) {
				x = this.bounds.x;
				y += scaling.newSpeakerGap;
			} else if (x + width > this.bounds.x + this.bounds.width) {
				x = this.bounds.x;
				y += scaling.lineHeight;
			}

			if (this.passesSearchFilter(word)) {
				positions.push({
					word,
					x,
					y,
					textSize,
					width,
					user: this.userMap.get(word.speaker),
					isNewSpeaker: prevSpeaker !== null && word.speaker !== prevSpeaker
				});
			}

			x += getWordWidth(this.sk, word.word + ' ', textSize);
			prevSpeaker = word.speaker;
		}

		return positions;
	}

	findHoveredWord(positions: WordPosition[], scaling: Scaling): WordPosition | null {
		for (const pos of positions) {
			if (pos.user?.enabled) {
				const boxHeight = scaling.lineHeight;
				if (this.sk.overRect(pos.x, pos.y - boxHeight, pos.width, boxHeight)) {
					return pos;
				}
			}
		}
		return null;
	}

	drawSpeakerBackgrounds(positions: WordPosition[], scaling: Scaling): void {
		if (positions.length === 0) return;

		let sectionStart = 0;
		for (let i = 1; i <= positions.length; i++) {
			if (i === positions.length || positions[i].isNewSpeaker) {
				const section = positions.slice(sectionStart, i);
				const user = section[0]?.user;

				if (user?.enabled && user?.color) {
					const minY = Math.min(...section.map((w) => w.y)) - scaling.lineHeight;
					const maxY = Math.max(...section.map((w) => w.y));
					const c = this.sk.color(user.color);
					c.setAlpha(15);

					this.sk.noStroke();
					this.sk.fill(c);
					this.sk.rect(this.bounds.x - 5, minY, this.bounds.width + 10, maxY - minY + 10, 5);
				}
				sectionStart = i;
			}
		}
	}

	drawWord(pos: WordPosition, hoveredPos: WordPosition | null, scaling: Scaling): void {
		const { word, x, y, textSize, width, user } = pos;
		const isHovered = hoveredPos?.word === word;
		const isSameWord = hoveredPos && word.word === hoveredPos.word.word && !isHovered;

		const displaySize = isHovered ? textSize * HOVER_SCALE : textSize;
		this.sk.textSize(displaySize);

		// Highlight other instances of the same word
		if (isSameWord) {
			this.sk.noFill();
			this.sk.stroke(user?.color || 200);
			this.sk.strokeWeight(1);
			this.sk.rect(x - 2, y - textSize - 2, width + 4, textSize + 4, 3);
		}

		// Highlight hovered word
		if (isHovered) {
			this.sk.noFill();
			this.sk.stroke(user?.color || 255);
			this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
			this.sk.rect(x - 3, y - textSize - 3, width + 6, textSize + 6, 4);
		}

		// Draw the word text
		this.sk.noStroke();
		this.sk.fill(this.getWordColor(user, word));

		const drawX = isHovered ? x - (width * (HOVER_SCALE - 1)) / 2 : x;
		this.sk.text(word.word, drawX, y);
	}

	getWordColor(user: User | undefined, word: DataPoint): string | number {
		if (!user?.enabled) return 255;

		const selectedWord = this.config.selectedWordFromContributionCloud;
		if (!selectedWord || word.word === selectedWord.word || word.turnNumber === selectedWord.turnNumber) {
			return user.color;
		}
		return 225;
	}

	showWordTooltip(pos: WordPosition, allPositions: WordPosition[]): void {
		const { word, user } = pos;
		const turnContext = this.getTurnContext(word, allPositions);
		const totalCount = this.getTotalWordCount(word.word, allPositions);

		let content = `<b>${word.speaker}:</b> ${turnContext || word.word}`;

		const details = [`×${totalCount}`, `Turn ${word.turnNumber}`];
		const transcript = get(TranscriptStore);
		if (transcript.timingMode !== 'untimed' && word.startTime != null) {
			details.push(formatTimeCompact(word.startTime));
		}

		content += `\n<span style="font-size: 0.85em; opacity: 0.7">${details.join('  ·  ')}</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || [200, 200, 200], this.sk.height);
	}

	getTurnContext(word: DataPoint, allPositions: WordPosition[]): string | null {
		const turnWords = allPositions
			.filter((p) => p.word.turnNumber === word.turnNumber)
			.sort((a, b) => a.word.startTime - b.word.startTime)
			.map((p) => p.word.word);

		if (turnWords.length === 0) return null;

		const wordIndex = turnWords.findIndex((w) => w === word.word);
		const parts = turnWords.map((w, i) => (i === wordIndex ? `<b>${w}</b>` : w));

		let sentence = parts.join(' ');
		if (sentence.length > MAX_TOOLTIP_LENGTH && wordIndex >= 0) {
			const start = Math.max(0, wordIndex - 8);
			const end = Math.min(parts.length, wordIndex + 12);
			sentence = (start > 0 ? '... ' : '') + parts.slice(start, end).join(' ') + (end < parts.length ? ' ...' : '');
		}

		return sentence;
	}

	getTotalWordCount(wordText: string, allPositions: WordPosition[]): number {
		const first = allPositions.find((p) => p.word.word === wordText);
		return first?.word.count || 1;
	}

	isWordVisible(word: DataPoint): boolean {
		if (this.config.dashboardToggle && !this.sk.shouldDraw(word, 'turnNumber', 'firstWordOfTurnSelectedInTurnChart')) {
			return false;
		}
		if (this.config.repeatedWordsToggle && word.count < this.config.repeatWordSliderValue) {
			return false;
		}
		return true;
	}

	passesSearchFilter(word: DataPoint): boolean {
		if (!this.config.wordToSearch) return true;
		return word.word.toLowerCase().includes(this.config.wordToSearch.toLowerCase());
	}
}
