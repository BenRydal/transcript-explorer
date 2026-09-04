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
import { flowerRadius, stemFraction, MIN_FLOWER_RADIUS } from './garden-scaling';
import { truncateMiddle } from './lane-layout';
import { lockedActorCount, LOCKED_BLOOM_GAIN } from '../core/scale-lock';

const LABEL_GAP = 6;
/** Names run up the stem, rooted at the baseline and reading toward the bloom. */
const LABEL_ANGLE = -Math.PI / 2;
/**
 * How far right of the stem the name sits, as a share of text size. The text band is
 * centred on this, so it stands off the stalk by roughly half again its own height.
 */
const LABEL_STEM_OFFSET = 1.25;
/** Petal reach as a share of the flower's scaled area, from flower-drawing's petal geometry. */
const BLOOM_RADIUS_RATIO = 0.62;

/**
 * Drops the spawn id from a delegated agent's name: `Agent:general-purpose:a2b12912`
 * becomes `Agent:general-purpose`. The id distinguishes one agent from another but
 * costs more label width than the rest of the name, so it is noise at this size.
 * Tool names carry no id, so they pass through untouched.
 */
function labelName(speaker: string): string {
	const parts = speaker.split(':');
	return parts.length > 2 ? parts.slice(0, 2).join(':') : speaker;
}

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
	bloomColumnRadius: number;
	xPosCurCircle: number;
	yPosTop: number;
	yPosBottom: number;
	maxFlowerRadius: number;
	hoveredSpeaker: string | null;
	private isAi: boolean;
	private showLabels: boolean;
	private labelSize: number;

	constructor(ctx: DrawContext, pos: Bounds) {
		this.ctx = ctx;
		this.isAi = ctx.transcript.sourceKind === 'ai';
		// Names ride the stems now, so the garden keeps its full height. A panel too
		// short to letter is handled where the label is drawn: the stem is the budget,
		// and a stem with no room for a name yields none.
		this.showLabels = ctx.config.speakerGardenLabels !== false;
		this.labelSize = Math.max(8, Math.min(12, pos.height * 0.026));
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
		this.bloomColumnRadius = this.getBloomColumnRadius(pos.width);
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
		const fraction = stemFraction(numOfTurns, this.largestNumOfTurnsByASpeaker, this.isAi);
		const yPos = this.yPosBottom - fraction * (this.yPosBottom - top);

		drawFlower(this.ctx.sk, {
			xPos: this.xPosCurCircle,
			yPos,
			bottomY: this.yPosBottom,
			scaledWordArea,
			color
		});

		if (this.showLabels) this.drawSpeakerLabel(speaker, yPos, scaledWordArea * BLOOM_RADIUS_RATIO);

		if (this.ctx.sk.overCircle(this.xPosCurCircle, yPos, scaledWordArea)) {
			this.hoveredSpeaker = speaker;
			this.drawSpeakerTooltip(speaker, numOfTurns, numOfWords, tempTurnArray, color);
		}
	}

	/** Runs the name up the stem, rooted at the baseline and reading toward the bloom. */
	drawSpeakerLabel(speaker: string, yPos: number, bloomRadius: number): void {
		const sk = this.ctx.sk;

		sk.push();
		sk.noStroke();
		sk.fill(this.ctx.theme.fg);
		sk.textSize(this.labelSize);
		sk.textAlign(sk.LEFT, sk.CENTER);

		// The stem is the budget, not the column: a name climbs from just above the
		// ground line to just below the petals. Stems run far longer than columns are
		// wide, so most names now fit whole -- but a speaker with few turns has a short
		// stem, and that one still has to give.
		const root = this.yPosBottom - LABEL_GAP;
		const budget = root - (yPos + bloomRadius + LABEL_GAP);
		const label = truncateMiddle(labelName(speaker), budget, (t) => sk.textWidth(t));

		// Rotating -90 degrees turns the text's own x-axis into screen-up, so a
		// LEFT-aligned draw grows from the root toward the flower. The stem's bezier
		// starts at xPos, so standing the name off to the right clears the stroke.
		sk.translate(this.xPosCurCircle + this.labelSize * LABEL_STEM_OFFSET, root);
		sk.rotate(LABEL_ANGLE);
		sk.text(label, 0, 0);
		sk.pop();
	}

	drawFlowerGuideLines(): void {
		const top = this.yPosTop + this.maxFlowerRadius;
		const halfSpacing = CANVAS_SPACING / 2;
		const theme = this.ctx.theme;

		this.ctx.sk.stroke(theme.fg);
		this.ctx.sk.strokeWeight(2);
		this.ctx.sk.line(this.bounds.x, top, this.bounds.x, this.yPosBottom);
		this.ctx.sk.line(this.bounds.x - halfSpacing, top, this.bounds.x + halfSpacing, top);

		this.ctx.sk.fill(theme.fg);
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

	/** Spacing between stems: one column per speaker, so a garden fills its panel. */
	getMaxCircleRadius(pixelWidth: number): number {
		return pixelWidth / (this.ctx.users.length + 1);
	}

	/**
	 * The column the bloom scale is spent inside, which is what sets
	 * pixels-per-word.
	 *
	 * Normally that is the speaker's own column, so each garden uses its whole
	 * panel. Under the capture lock it is the column a `LOCKED_ACTOR_COUNT`
	 * session would get, since otherwise a two-speaker garden draws a word many
	 * times larger than a crowded one does and the figures cannot be read against
	 * each other -- the lock's whole purpose. Spacing still follows the real cast,
	 * so a small cast stands further apart rather than huddling at the left edge.
	 *
	 * `LOCKED_BLOOM_GAIN` then enlarges that pinned column, since a 25-actor
	 * column is small enough to be hard to read. It multiplies every locked
	 * session equally, so it costs horizontal room in the crowded one rather than
	 * comparability.
	 */
	getBloomColumnRadius(pixelWidth: number): number {
		const locked = lockedActorCount();
		if (locked === undefined) return pixelWidth / (this.ctx.users.length + 1);
		return (pixelWidth / (locked + 1)) * LOCKED_BLOOM_GAIN;
	}

	getScaledArea(value: number): number {
		return flowerRadius(value, this.largestNumOfWordsByASpeaker, this.bloomColumnRadius, this.isAi);
	}

	calculateMaxFlowerRadius(): number {
		const maxHeightForFlower = this.bounds.height * 0.25;
		return Math.max(Math.min(this.bloomColumnRadius, maxHeightForFlower), MIN_FLOWER_RADIUS);
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
