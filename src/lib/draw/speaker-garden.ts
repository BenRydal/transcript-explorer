/**
 * Speaker Garden Visualization
 *
 * Displays speaker contributions as flowers.
 * - Stalk height = number of turns
 * - Flower size = number of words
 * - Color = speaker color
 *
 * Flower rendering (stalks, leaves, petals) is handled by flower-drawing.ts.
 */

import type p5 from 'p5';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import { normalizeWord } from '../core/string-utils';
import { withDimming, getCrossHighlight, getDominantCodeColor } from './draw-utils';
import { CANVAS_SPACING } from '../constants/ui';
import { drawFlower } from './flower-drawing';
import { DrawContext } from './draw-context';

const MIN_FLOWER_SIZE = 25; // Minimum flower radius so small speakers are still visible

interface SpeakerMetrics {
	numOfTurns: number;
	numOfWords: number;
	scaledWordArea: number;
}

export class SpeakerGarden {
	ctx: DrawContext;
	largestNumOfWordsByASpeaker: number;
	largestNumOfTurnsByASpeaker: number;
	localArrayOfFirstWords: DataPoint[];
	bounds: Bounds;
	maxCircleRadius: number;
	maxCircleArea: number;
	xPosCurCircle: number;
	yPosTop: number;
	yPosBottom: number;
	maxFlowerRadius: number;
	hoveredSpeaker: string | null;

	constructor(ctx: DrawContext, pos: Bounds) {
		this.ctx = ctx;
		// When scaleToVisibleData is enabled, we'll compute these in draw() from visible data
		if (this.ctx.config.scaleToVisibleData) {
			this.largestNumOfWordsByASpeaker = 0;
			this.largestNumOfTurnsByASpeaker = 0;
		} else {
			this.largestNumOfWordsByASpeaker = this.ctx.transcript.largestNumOfWordsByASpeaker;
			this.largestNumOfTurnsByASpeaker = this.ctx.transcript.largestNumOfTurnsByASpeaker;
		}
		this.localArrayOfFirstWords = [];
		this.bounds = pos;
		this.maxCircleRadius = this.getMaxCircleRadius(pos.width);
		this.maxCircleArea = Math.PI * this.maxCircleRadius * this.maxCircleRadius;
		this.xPosCurCircle = pos.x + this.maxCircleRadius;
		this.yPosTop = pos.y;
		this.yPosBottom = pos.y + pos.height;
		this.maxFlowerRadius = this.calculateMaxFlowerRadius();
		this.hoveredSpeaker = null;
	}

	draw(sortedAnimationWordArray: Record<string, DataPoint[]>): { hoveredSpeaker: string | null } {
		const searchTerm = this.ctx.config.wordToSearch ? normalizeWord(this.ctx.config.wordToSearch) : undefined;
		this.hoveredSpeaker = null;

		// Compute max values from visible data when scaleToVisibleData is enabled
		if (this.ctx.config.scaleToVisibleData) {
			this.computeMaxFromVisibleData(sortedAnimationWordArray);
		}

		const crossHighlight = getCrossHighlight(this.ctx.sk, this.bounds, this.ctx.config.dashboardToggle, this.ctx.hover);

		this.drawFlowerGuideLines();

		for (const key in sortedAnimationWordArray) {
			if (sortedAnimationWordArray[key].length) {
				const user = this.ctx.userMap.get(sortedAnimationWordArray[key][0].speaker);
				if (user?.enabled) {
					let wordsToVisualize = sortedAnimationWordArray[key];
					if (searchTerm) {
						wordsToVisualize = wordsToVisualize.filter((w) => normalizeWord(w.word).includes(searchTerm));
					}

					if (wordsToVisualize.length > 0) {
						const shouldDim =
							crossHighlight.active &&
							((crossHighlight.speaker != null && wordsToVisualize[0].speaker !== crossHighlight.speaker) ||
								(crossHighlight.turns != null && !wordsToVisualize.some((w) => crossHighlight.turns!.includes(w.turnNumber))));
						withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
							this.drawViz(wordsToVisualize);
						});
					}
				}
			}
			this.xPosCurCircle += this.maxCircleRadius;
		}

		return { hoveredSpeaker: this.hoveredSpeaker };
	}

	drawViz(tempTurnArray: DataPoint[]): void {
		const metrics = this.calculateMetrics(tempTurnArray);
		const user = this.ctx.userMap.get(tempTurnArray[0].speaker);
		if (!user) return;
		const resolvedColor = getDominantCodeColor(tempTurnArray, user.color, this.ctx.codeColorMap, this.ctx.config.codeColorMode);
		const color = this.ctx.sk.color(resolvedColor);
		this.drawFlowerVisualization(color, metrics, tempTurnArray);
	}

	calculateMetrics(tempTurnArray: DataPoint[]): SpeakerMetrics {
		const numOfTurns = this.calculateNumOfTurns(tempTurnArray);
		const numOfWords = tempTurnArray.length;
		return {
			numOfTurns,
			numOfWords,
			scaledWordArea: this.getScaledArea(numOfWords)
		};
	}

	drawFlowerVisualization(color: p5.Color, metrics: SpeakerMetrics, tempTurnArray: DataPoint[]): void {
		const { scaledWordArea, numOfTurns, numOfWords } = metrics;
		const speaker = tempTurnArray[0]?.speaker || '';
		const top = this.yPosTop + this.maxFlowerRadius;
		const yPos = this.ctx.sk.map(numOfTurns, 0, this.largestNumOfTurnsByASpeaker, this.yPosBottom, top);

		drawFlower(this.ctx.sk, {
			xPos: this.xPosCurCircle,
			yPos,
			bottomY: this.yPosBottom,
			scaledWordArea,
			color
		});

		if (this.ctx.sk.overCircle(this.xPosCurCircle, yPos, scaledWordArea)) {
			this.hoveredSpeaker = speaker;
			this.drawSpeakerTooltip(speaker, numOfTurns, numOfWords, tempTurnArray, color);
		}
	}

	drawFlowerGuideLines(): void {
		const top = this.yPosTop + this.maxFlowerRadius;
		const halfSpacing = CANVAS_SPACING / 2;

		this.ctx.sk.stroke(0);
		this.ctx.sk.strokeWeight(2);
		this.ctx.sk.line(this.bounds.x, top, this.bounds.x, this.yPosBottom);
		this.ctx.sk.line(this.bounds.x - halfSpacing, top, this.bounds.x + halfSpacing, top);

		this.ctx.sk.fill(0);
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.BASELINE);
		this.ctx.sk.textSize(Math.max(10, Math.min(16, this.bounds.height * 0.04)));
		this.ctx.sk.text(`${this.largestNumOfTurnsByASpeaker} Turns`, this.bounds.x - halfSpacing, top - halfSpacing);
	}

	calculateNumOfTurns(objects: DataPoint[]): number {
		return new Set(objects.map((obj) => obj.turnNumber)).size;
	}

	drawSpeakerTooltip(speaker: string, numOfTurns: number, numOfWords: number, turnArray: DataPoint[], speakerColor: p5.Color): void {
		const MAX_FIRST_WORDS = 50;

		const firstWords = new Set<number>();
		const wordsToDisplay: string[] = [];

		turnArray.forEach((element) => {
			if (!firstWords.has(element.turnNumber)) {
				firstWords.add(element.turnNumber);
				this.localArrayOfFirstWords.push(element);
				wordsToDisplay.push(element.word);
			}
		});

		const totalWords = this.ctx.transcript.totalNumOfWords;
		const totalTurns = this.ctx.transcript.totalConversationTurns;
		const wordPercent = totalWords > 0 ? Math.round((numOfWords / totalWords) * 100) : 0;
		const turnPercent = totalTurns > 0 ? Math.round((numOfTurns / totalTurns) * 100) : 0;

		let firstWordsLine: string;
		if (wordsToDisplay.length <= MAX_FIRST_WORDS) {
			firstWordsLine = wordsToDisplay.join(', ');
		} else {
			const remaining = wordsToDisplay.length - MAX_FIRST_WORDS;
			firstWordsLine = wordsToDisplay.slice(0, MAX_FIRST_WORDS).join(', ') + `... (and ${remaining} more turns)`;
		}

		const statsLine = `${numOfWords} total words (${wordPercent}%)\n${numOfTurns} turns (${turnPercent}%)`;
		const tooltipContent = `<b>First word of each turn:</b>\n${firstWordsLine}\n\n${statsLine}`;

		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, tooltipContent, speakerColor, this.bounds.y + this.bounds.height);
	}

	getMaxCircleRadius(pixelWidth: number): number {
		return pixelWidth / (this.ctx.users.length + 1);
	}

	getScaledArea(value: number): number {
		const normalizedValue = value / this.largestNumOfWordsByASpeaker;
		const area = normalizedValue * this.maxCircleArea;
		const radius = Math.sqrt(area / Math.PI);
		return Math.max(radius, MIN_FLOWER_SIZE);
	}

	calculateMaxFlowerRadius(): number {
		const radiusFromWidth = Math.sqrt(this.maxCircleArea / Math.PI);
		const maxHeightForFlower = this.bounds.height * 0.25;
		return Math.max(Math.min(radiusFromWidth, maxHeightForFlower), MIN_FLOWER_SIZE);
	}

	/**
	 * Computes the maximum words and turns from the visible data (for scaleToVisibleData mode).
	 */
	private computeMaxFromVisibleData(data: Record<string, DataPoint[]>): void {
		let maxWords = 0;
		let maxTurns = 0;
		for (const key in data) {
			const words = data[key];
			if (words.length === 0) continue;
			const user = this.ctx.userMap.get(words[0].speaker);
			if (!user?.enabled) continue;
			maxWords = Math.max(maxWords, words.length);
			maxTurns = Math.max(maxTurns, this.calculateNumOfTurns(words));
		}
		this.largestNumOfWordsByASpeaker = Math.max(maxWords, 1);
		this.largestNumOfTurnsByASpeaker = Math.max(maxTurns, 1);
	}
}
