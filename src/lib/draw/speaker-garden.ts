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
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import { normalizeWord } from '../core/string-utils';
import { withDimming } from './draw-utils';
import { CANVAS_SPACING } from '../constants/ui';
import { drawFlower } from './flower-drawing';

const MIN_FLOWER_SIZE = 25; // Minimum flower radius so small speakers are still visible

interface SpeakerMetrics {
	numOfTurns: number;
	numOfWords: number;
	scaledWordArea: number;
}

export class SpeakerGarden {
	sk: p5;
	users: User[];
	userMap: Map<string, User>;
	config: ConfigStoreType;
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

	constructor(sk: p5, pos: Bounds) {
		this.sk = sk;
		this.users = get(UserStore);
		this.userMap = new Map(this.users.map((user) => [user.name, user]));
		this.config = get(ConfigStore);
		const transcript = get(TranscriptStore);
		this.largestNumOfWordsByASpeaker = transcript.largestNumOfWordsByASpeaker;
		this.largestNumOfTurnsByASpeaker = transcript.largestNumOfTurnsByASpeaker;
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
		const searchTerm = this.config.wordToSearch ? normalizeWord(this.config.wordToSearch) : undefined;
		this.hoveredSpeaker = null;

		const hl = this.config.dashboardHighlightSpeaker;
		const hlTurns = this.config.dashboardHighlightAllTurns;
		const mouseInPanel = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
		const crossHighlightActive = this.config.dashboardToggle && (hl != null || hlTurns != null) && !mouseInPanel;

		this.drawFlowerGuideLines();

		for (const key in sortedAnimationWordArray) {
			if (sortedAnimationWordArray[key].length) {
				const user = this.userMap.get(sortedAnimationWordArray[key][0].speaker);
				if (user?.enabled) {
					let wordsToVisualize = sortedAnimationWordArray[key];
					if (searchTerm) {
						wordsToVisualize = wordsToVisualize.filter((w) => normalizeWord(w.word).includes(searchTerm));
					}

					if (wordsToVisualize.length > 0) {
						const shouldDim = crossHighlightActive && (
							(hl != null && wordsToVisualize[0].speaker !== hl) ||
							(hlTurns != null && !wordsToVisualize.some((w) => hlTurns.includes(w.turnNumber)))
						);
						withDimming(this.sk.drawingContext, shouldDim, () => {
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
		const user = this.userMap.get(tempTurnArray[0].speaker);
		if (!user) return;
		const color = this.sk.color(user.color);
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

		const bottom = this.yPosBottom;
		const top = this.yPosTop + this.maxFlowerRadius;

		// Map turns to Y position (flower center position)
		const scaledNumOfTurns = this.sk.map(numOfTurns, 0, this.largestNumOfTurnsByASpeaker, bottom, top);

		drawFlower(this.sk, {
			xPos: this.xPosCurCircle,
			yPos: scaledNumOfTurns,
			bottomY: bottom,
			scaledWordArea,
			color
		});

		if (this.sk.overCircle(this.xPosCurCircle, scaledNumOfTurns, scaledWordArea)) {
			this.hoveredSpeaker = speaker;
			this.drawSpeakerTooltip(speaker, numOfTurns, numOfWords, tempTurnArray, color);
		}
	}

	drawFlowerGuideLines(): void {
		const bottom = this.yPosBottom;
		const top = this.yPosTop + this.maxFlowerRadius;
		const xLeft = this.bounds.x;

		this.sk.stroke(0);
		this.sk.strokeWeight(2);
		this.sk.line(xLeft, top, xLeft, bottom);
		this.sk.line(xLeft - CANVAS_SPACING / 2, top, xLeft + CANVAS_SPACING / 2, top);

		this.sk.fill(0);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.LEFT, this.sk.BASELINE);
		this.sk.textSize(Math.max(10, Math.min(16, this.bounds.height * 0.04)));
		this.sk.text(`${this.largestNumOfTurnsByASpeaker} Turns`, xLeft - CANVAS_SPACING / 2, top - CANVAS_SPACING / 2);
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

		const transcript = get(TranscriptStore);
		const totalWords = transcript.totalNumOfWords;
		const totalTurns = transcript.totalConversationTurns;
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

		showTooltip(this.sk.mouseX, this.sk.mouseY, tooltipContent, speakerColor, this.bounds.y + this.bounds.height);
	}

	getMaxCircleRadius(pixelWidth: number): number {
		return pixelWidth / (this.users.length + 1);
	}

	getScaledArea(value: number): number {
		const normalizedValue = value / this.largestNumOfWordsByASpeaker;
		const area = normalizedValue * this.maxCircleArea;
		const radius = Math.sqrt(area / Math.PI);
		return Math.max(radius, MIN_FLOWER_SIZE);
	}

	calculateMaxFlowerRadius(): number {
		const normalizedValue = 1;
		const area = normalizedValue * this.maxCircleArea;
		const radiusFromWidth = Math.sqrt(area / Math.PI);
		const maxHeightForFlower = this.bounds.height * 0.25;
		return Math.max(Math.min(radiusFromWidth, maxHeightForFlower), MIN_FLOWER_SIZE);
	}
}
