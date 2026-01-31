/**
 * Distribution Diagram Visualization
 *
 * Displays speaker contributions as either circles or flowers.
 * - Circle mode: concentric circles sized by word count and turn count
 * - Flower mode: flowers with stalk height = turns, flower size = words
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
import { drawFlower } from './flower-drawing';

const MIN_FLOWER_SIZE = 25; // Minimum flower radius so small speakers are still visible

interface SpeakerMetrics {
	numOfTurns: number;
	numOfWords: number;
	scaledWordArea: number;
	scaledTurnArea: number;
}

export class DistributionDiagram {
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
	yPosHalfHeight: number;
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
		this.yPosHalfHeight = pos.y + pos.height / 2;
		this.maxFlowerRadius = this.calculateMaxFlowerRadius();
		this.hoveredSpeaker = null;
	}

	draw(sortedAnimationWordArray: Record<string, DataPoint[]>): { hoveredSpeaker: string | null } {
		const searchTerm = this.config.wordToSearch?.toLowerCase();
		this.hoveredSpeaker = null;

		if (this.config.flowersToggle) {
			this.drawFlowerGuideLines();
		}

		for (const key in sortedAnimationWordArray) {
			if (sortedAnimationWordArray[key].length) {
				const user = this.userMap.get(sortedAnimationWordArray[key][0].speaker);
				if (user?.enabled) {
					let wordsToVisualize = sortedAnimationWordArray[key];
					if (searchTerm) {
						wordsToVisualize = wordsToVisualize.filter((w) => w.word.toLowerCase().includes(searchTerm));
					}

					if (wordsToVisualize.length > 0) {
						this.drawViz(wordsToVisualize, this.config.flowersToggle);
					}
				}
			}
			this.xPosCurCircle += this.maxCircleRadius;
		}

		return { hoveredSpeaker: this.hoveredSpeaker };
	}

	drawViz(tempTurnArray: DataPoint[], isDrawFlower: boolean): void {
		const firstElement = tempTurnArray[0];
		const metrics = this.calculateMetrics(tempTurnArray, isDrawFlower);
		const user = this.userMap.get(firstElement.speaker);
		if (!user) return;
		const color = this.sk.color(user.color);

		if (isDrawFlower) {
			this.drawFlowerVisualization(color, metrics, tempTurnArray);
		} else {
			this.drawCircleVisualization(firstElement, color, metrics, tempTurnArray);
		}
	}

	calculateMetrics(tempTurnArray: DataPoint[], isFlower = false): SpeakerMetrics {
		const numOfTurns = this.calculateNumOfTurns(tempTurnArray);
		const numOfWords = tempTurnArray.length;
		return {
			numOfTurns,
			numOfWords,
			scaledWordArea: this.getScaledArea(numOfWords, isFlower),
			scaledTurnArea: this.getScaledArea(numOfTurns, isFlower)
		};
	}

	drawCircleVisualization(firstElement: DataPoint, color: p5.Color, metrics: SpeakerMetrics, tempTurnArray: DataPoint[]): void {
		const { scaledWordArea, scaledTurnArea, numOfTurns, numOfWords } = metrics;

		this.setColor(color, 120);
		this.sk.circle(this.xPosCurCircle, this.yPosHalfHeight, scaledWordArea);

		this.setColor(color, 255);
		this.sk.circle(this.xPosCurCircle, this.yPosHalfHeight, scaledTurnArea);

		if (this.sk.overCircle(this.xPosCurCircle, this.yPosHalfHeight, scaledWordArea)) {
			this.hoveredSpeaker = firstElement.speaker;
			this.drawSpeakerTooltip(firstElement.speaker, numOfTurns, numOfWords, tempTurnArray, color);
		}
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
		this.sk.line(xLeft - this.sk.SPACING / 2, top, xLeft + this.sk.SPACING / 2, top);

		this.sk.fill(0);
		this.sk.noStroke();
		this.sk.textSize(16);
		this.sk.text(`${this.largestNumOfTurnsByASpeaker} Turns`, xLeft - this.sk.SPACING / 2, top - this.sk.SPACING / 2);
	}

	calculateNumOfTurns(objects: DataPoint[]): number {
		return new Set(objects.map((obj) => obj.turnNumber)).size;
	}

	setColor(color: p5.Color, alpha: number): void {
		color.setAlpha(alpha);
		this.sk.noStroke();
		this.sk.fill(color);
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

		showTooltip(this.sk.mouseX, this.sk.mouseY, tooltipContent, speakerColor, this.sk.height);
	}

	getMaxCircleRadius(pixelWidth: number): number {
		return pixelWidth / (this.users.length + 1);
	}

	getScaledArea(value: number, applyMinimum = false): number {
		const normalizedValue = value / this.largestNumOfWordsByASpeaker;
		const area = normalizedValue * this.maxCircleArea;
		const radius = Math.sqrt(area / Math.PI);
		return applyMinimum ? Math.max(radius, MIN_FLOWER_SIZE) : radius;
	}

	calculateMaxFlowerRadius(): number {
		const normalizedValue = 1;
		const area = normalizedValue * this.maxCircleArea;
		const radiusFromWidth = Math.sqrt(area / Math.PI);
		const maxHeightForFlower = this.bounds.height * 0.25;
		return Math.max(Math.min(radiusFromWidth, maxHeightForFlower), MIN_FLOWER_SIZE);
	}
}
