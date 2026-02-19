import type p5 from 'p5';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import VideoStore from '../../stores/videoStore';
import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Transcript } from '../../models/transcript';
import type { Timeline } from '../../models/timeline';
import type { Bounds } from './types/bounds';
import { CANVAS_SPACING } from '../constants/ui';
import { drawPlayhead } from './draw-utils';

function formatDuration(seconds: number): string {
	return `${Math.round(seconds)}s`;
}

// Vertical padding so bubbles don't touch the top/bottom edges
const VERTICAL_PADDING = 12;

// Annotation strip constants
const STRIP_HEIGHT_RATIO = 0.1;
const MIN_STRIP_HEIGHT = 20;
const MAX_STRIP_HEIGHT = 32;
const OVERLAP_COLOR = '#ef4444';
const GAP_COLOR = '#94a3b8';
const MARKER_HEIGHT = 8;
const ROW_GAP = 2;
const MIN_MARKER_WIDTH = 2;
const LEGEND_DOT_RADIUS = 5;
const LEGEND_DOT_LEFT_OFFSET = 8;

interface SelectedTurn {
	turn: DataPoint[] | '';
	color: string;
	xCenter: number;
	yCenter: number;
	width: number;
	height: number;
}

interface TurnRange {
	speaker: string;
	startTime: number;
	endTime: number;
	firstDataPoint: DataPoint;
}

interface AnnotationMarker {
	x: number;
	w: number;
	y: number;
	h: number;
	color: string;
	firstDataPoint: DataPoint;
	tooltipContent: string;
}

export class TurnChart {
	sk: p5;
	bounds: Bounds;
	config: ConfigStoreType;
	transcript: Transcript;
	users: User[];
	userMap: Map<string, { user: User; index: number }>;
	timeline: Timeline;
	verticalLayoutSpacing: number;
	yPosHalfHeight: number;
	userSelectedTurn: SelectedTurn;
	yPosSeparate: number;
	annotationHover: DataPoint | null = null;
	private stripBounds: Bounds | null;
	private panelBottom: number;
	private maxTurnLength: number;

	constructor(sk: p5, pos: Bounds) {
		this.sk = sk;
		this.transcript = get(TranscriptStore);
		this.config = get(ConfigStore);
		const showStrip = this.transcript.timingMode !== 'untimed' && this.config.silenceOverlapToggle;
		const stripHeight = showStrip ? Math.max(MIN_STRIP_HEIGHT, Math.min(MAX_STRIP_HEIGHT, pos.height * STRIP_HEIGHT_RATIO)) : 0;
		this.bounds = {
			x: pos.x,
			y: pos.y + VERTICAL_PADDING,
			width: pos.width,
			height: pos.height - stripHeight - VERTICAL_PADDING * 2
		};
		this.stripBounds = showStrip
			? {
					x: pos.x,
					y: pos.y + pos.height - stripHeight,
					width: pos.width,
					height: stripHeight
				}
			: null;
		this.panelBottom = pos.y + pos.height;
		this.users = get(UserStore);
		this.userMap = new Map(this.users.map((user, index) => [user.name, { user, index }]));
		this.timeline = get(TimelineStore);
		this.verticalLayoutSpacing = this.getVerticalLayoutSpacing(this.bounds.height);
		this.yPosHalfHeight = this.bounds.y + this.bounds.height / 2;
		this.userSelectedTurn = { turn: '', color: '', xCenter: 0, yCenter: 0, width: 0, height: 0 };
		this.yPosSeparate = this.getYPosTopSeparate();
		// When scaleToVisibleData is enabled, we'll compute this in draw() from visible data
		this.maxTurnLength = this.config.scaleToVisibleData ? 0 : this.transcript.largestTurnLength;
	}

	getYPosTopSeparate(): number {
		const total = this.users?.length || 0;
		const centerIndex = (total - 1) / 2;
		return this.yPosHalfHeight - centerIndex * this.verticalLayoutSpacing;
	}

	/** Draws the main chart */
	draw(sortedAnimationWordArray: Record<number, DataPoint[]>): { hoveredSpeaker: string | null } {
		this.userSelectedTurn = { turn: '', color: '', xCenter: 0, yCenter: 0, width: 0, height: 0 }; // Reset each frame
		this.annotationHover = null;

		// Compute max turn length from visible data when scaleToVisibleData is enabled
		if (this.config.scaleToVisibleData) {
			this.maxTurnLength = this.computeMaxTurnLength(sortedAnimationWordArray);
		}

		this.drawTimeline();
		this.sk.textSize(this.sk.toolTipTextSize);
		for (const key in sortedAnimationWordArray) {
			const turnArray = sortedAnimationWordArray[key];
			if (!turnArray.length) continue;
			const userData = this.userMap.get(turnArray[0].speaker);
			if (userData && this.testShouldDraw(userData.user, turnArray)) {
				this.drawBubs(turnArray, userData.user, userData.index);
			}
		}
		if (this.userSelectedTurn.turn && this.userSelectedTurn.color) {
			const sel = this.userSelectedTurn;
			this.sk.noFill();
			this.sk.stroke(sel.color);
			this.sk.strokeWeight(2);
			this.sk.ellipse(sel.xCenter, sel.yCenter, sel.width, sel.height);
			this.drawText(sel.turn as DataPoint[], sel.color);
		}
		if (this.stripBounds) {
			this.drawAnnotationStrip(sortedAnimationWordArray);
		}

		// Playhead: video playing → video time, animating → animation time, otherwise → follow mouse
		const videoState = get(VideoStore);
		const isTimed = this.transcript.timingMode !== 'untimed';
		const playheadRegion: Bounds = { x: this.bounds.x, y: this.bounds.y, width: this.bounds.width, height: this.panelBottom - this.bounds.y };
		let playheadTime: number | null = null;
		if (videoState.isLoaded && videoState.isPlaying && isTimed) {
			playheadTime = videoState.currentTime;
		} else if (this.timeline.isAnimating) {
			playheadTime = this.timeline.currTime;
		} else if (this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.panelBottom - this.bounds.y)) {
			const frac = (this.sk.mouseX - this.bounds.x) / this.bounds.width;
			playheadTime = this.timeline.leftMarker + frac * (this.timeline.rightMarker - this.timeline.leftMarker);
		}
		if (playheadTime !== null) {
			drawPlayhead(this.sk, playheadTime, this.timeline.leftMarker, this.timeline.rightMarker, playheadRegion);
		}

		const turn = this.userSelectedTurn.turn;
		const hoveredTurnPoint = turn ? (turn as DataPoint[])[0] : null;
		return { hoveredSpeaker: hoveredTurnPoint?.speaker ?? null };
	}

	testShouldDraw(user: User, array: DataPoint[]): boolean {
		if (!user.enabled) return false;
		const mouseInPanel = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
		if (this.config.dashboardToggle && !mouseInPanel && !this.sk.shouldDraw(array[0])) return false;
		if (this.config.wordToSearch) {
			const combinedString = array.map(({ word }) => word).join(' ');
			if (!combinedString.includes(this.config.wordToSearch)) return false;
		}
		return true;
	}

	/** Draws the timeline axis */
	drawTimeline(): void {
		const start = this.bounds.x;
		const end = this.bounds.x + this.bounds.width;
		const y = this.yPosHalfHeight;
		const tickLength = CANVAS_SPACING / 2;
		this.sk.stroke(0);
		this.sk.strokeWeight(2);
		this.sk.fill(0);
		// Draw timeline and ticks
		this.sk.line(start, y - tickLength, start, y + tickLength);
		this.sk.line(end, y - tickLength, end, y + tickLength);
		this.sk.line(start, y, end, y);

		// Time labels
		const isUntimed = this.transcript.timingMode === 'untimed';
		if (isUntimed) return;
		const numTicks = Math.min(8, Math.floor(this.bounds.width / 60));
		this.sk.textSize(Math.max(10, Math.min(13, this.bounds.height * 0.035)));
		this.sk.fill(0);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.CENTER, this.sk.TOP);
		const duration = this.timeline.rightMarker - this.timeline.leftMarker;
		for (let i = 0; i <= numTicks; i++) {
			const frac = i / numTicks;
			const time = this.timeline.leftMarker + frac * duration;
			const x = start + frac * this.bounds.width;
			// Tick mark
			this.sk.stroke(0);
			this.sk.strokeWeight(1);
			this.sk.line(x, y, x, y + tickLength);
			// Label
			this.sk.noStroke();
			this.sk.text(formatTimeCompact(time), x, y + tickLength + 2);
		}
	}

	/** Draws turn bubbles */
	drawBubs(turnArray: DataPoint[], user: User, speakerIndex: number): void {
		const turnData = turnArray[0];
		const xStart = this.getPixelValueFromTime(turnData.startTime);
		const xEnd = this.getPixelValueFromTime(turnData.endTime);
		const width = xEnd - xStart;
		const xCenter = xStart + width / 2;
		const [height, yCenter] = this.getCoordinates(turnArray.length, speakerIndex);

		this.setStrokes(this.sk.color(user.color));
		this.sk.ellipse(xCenter, yCenter, width, height);

		if (this.sk.overRect(xStart, yCenter - height / 2, width, height)) {
			this.userSelectedTurn = { turn: turnArray, color: user.color, xCenter, yCenter, width, height };
		}
	}

	/** Determines the coordinates for turn bubbles */
	getCoordinates(turnLength: number, speakerIndex: number): [number, number] {
		let height: number, yCenter: number;
		if (this.config.separateToggle) {
			height = this.sk.map(turnLength, 0, this.maxTurnLength, 0, this.verticalLayoutSpacing);
			yCenter = this.yPosSeparate + this.verticalLayoutSpacing * speakerIndex;
		} else {
			height = this.sk.map(turnLength, 0, this.maxTurnLength, 0, this.bounds.height);
			yCenter = this.yPosHalfHeight;
		}
		return [height, yCenter];
	}

	setStrokes(color: p5.Color): void {
		this.sk.noStroke();
		color.setAlpha(200);
		this.sk.fill(color);
	}

	drawText(turnArray: DataPoint[], speakerColor: string): void {
		const speaker = turnArray[0].speaker;
		const combined = turnArray.map((e) => e.word).join(' ');
		showTooltip(this.sk.mouseX, this.sk.mouseY, `<b>${speaker}</b>\n${combined}`, speakerColor, this.panelBottom);
	}

	getVerticalLayoutSpacing(height: number): number {
		return height / this.users.length;
	}

	getPixelValueFromTime(timeValue: number): number {
		return this.sk.map(timeValue, this.timeline.leftMarker, this.timeline.rightMarker, this.bounds.x, this.bounds.x + this.bounds.width);
	}

	// ---- Annotation Strip ----

	private drawAnnotationStrip(turnData: Record<number, DataPoint[]>): void {
		const strip = this.stripBounds!;
		const topRowY = strip.y + (strip.height - MARKER_HEIGHT * 2 - ROW_GAP) / 2;
		const bottomRowY = topRowY + MARKER_HEIGHT + ROW_GAP;

		// Separator line
		this.sk.stroke(200);
		this.sk.strokeWeight(1);
		this.sk.line(strip.x, strip.y, strip.x + strip.width, strip.y);

		// Build turn ranges from the data we already have
		const turns = this.getTurnRanges(turnData);
		const markers = [...this.buildOverlapMarkers(turns, topRowY), ...this.buildGapMarkers(turns, bottomRowY)];

		// Legend dots
		const dotX = strip.x + LEGEND_DOT_LEFT_OFFSET;
		this.sk.noStroke();
		this.sk.fill(OVERLAP_COLOR);
		this.sk.ellipse(dotX, topRowY + MARKER_HEIGHT / 2, LEGEND_DOT_RADIUS, LEGEND_DOT_RADIUS);
		this.sk.fill(GAP_COLOR);
		this.sk.ellipse(dotX, bottomRowY + MARKER_HEIGHT / 2, LEGEND_DOT_RADIUS, LEGEND_DOT_RADIUS);

		// Draw markers
		this.sk.noStroke();
		for (const m of markers) {
			const c = this.sk.color(m.color);
			c.setAlpha(180);
			this.sk.fill(c);
			this.sk.rect(m.x, m.y, m.w, m.h, 2);
		}

		// Hover
		if (this.sk.overRect(strip.x, strip.y, strip.width, strip.height)) {
			for (const m of markers) {
				if (this.sk.overRect(m.x, m.y, m.w, m.h)) {
					this.sk.noFill();
					this.sk.stroke(m.color);
					this.sk.strokeWeight(2);
					this.sk.rect(m.x - 1, m.y - 1, m.w + 2, m.h + 2, 2);
					showTooltip(this.sk.mouseX, this.sk.mouseY, m.tooltipContent, m.color, this.panelBottom);
					this.annotationHover = m.firstDataPoint;
					break;
				}
			}
		}
	}

	private getTurnRanges(turnData: Record<number, DataPoint[]>): TurnRange[] {
		const ranges: TurnRange[] = [];
		for (const key in turnData) {
			const words = turnData[key];
			if (!words.length) continue;
			const userData = this.userMap.get(words[0].speaker);
			if (!userData?.user.enabled) continue;
			ranges.push({
				speaker: words[0].speaker,
				startTime: words[0].startTime,
				endTime: words[words.length - 1].endTime,
				firstDataPoint: words[0]
			});
		}
		return ranges.sort((a, b) => a.startTime - b.startTime);
	}

	private buildOverlapMarkers(turns: TurnRange[], rowY: number): AnnotationMarker[] {
		const markers: AnnotationMarker[] = [];
		for (let i = 0; i < turns.length; i++) {
			for (let j = i + 1; j < turns.length; j++) {
				if (turns[j].startTime >= turns[i].endTime) break;
				if (turns[j].speaker === turns[i].speaker) continue;
				const start = Math.max(turns[i].startTime, turns[j].startTime);
				const end = Math.min(turns[i].endTime, turns[j].endTime);
				if (end <= start) continue;
				const x = this.getPixelValueFromTime(start);
				const xEnd = this.getPixelValueFromTime(end);
				const duration = end - start;
				markers.push({
					x,
					w: Math.max(MIN_MARKER_WIDTH, xEnd - x),
					y: rowY,
					h: MARKER_HEIGHT,
					color: OVERLAP_COLOR,
					firstDataPoint: turns[j].firstDataPoint,
					tooltipContent: `<b>Overlap · ${formatDuration(duration)}</b>\n<span style="font-size: 0.85em; opacity: 0.7"><span style="color: ${this.userMap.get(turns[i].speaker)?.user.color ?? '#fff'}">${turns[i].speaker}</span> & <span style="color: ${this.userMap.get(turns[j].speaker)?.user.color ?? '#fff'}">${turns[j].speaker}</span>\n${formatTimeCompact(start)} - ${formatTimeCompact(end)}</span>`
				});
			}
		}
		return markers;
	}

	private buildGapMarkers(turns: TurnRange[], rowY: number): AnnotationMarker[] {
		const markers: AnnotationMarker[] = [];
		for (let i = 0; i < turns.length - 1; i++) {
			const gapDuration = turns[i + 1].startTime - turns[i].endTime;
			if (gapDuration <= 0) continue;
			const x = this.getPixelValueFromTime(turns[i].endTime);
			const xEnd = this.getPixelValueFromTime(turns[i + 1].startTime);
			markers.push({
				x,
				w: Math.max(MIN_MARKER_WIDTH, xEnd - x),
				y: rowY,
				h: MARKER_HEIGHT,
				color: GAP_COLOR,
				firstDataPoint: turns[i].firstDataPoint,
				tooltipContent: `<b>Silence · ${formatDuration(gapDuration)}</b>\n<span style="font-size: 0.85em; opacity: 0.7"><span style="color: ${this.userMap.get(turns[i].speaker)?.user.color ?? '#fff'}">${turns[i].speaker}</span> → <span style="color: ${this.userMap.get(turns[i + 1].speaker)?.user.color ?? '#fff'}">${turns[i + 1].speaker}</span>\n${formatTimeCompact(turns[i].endTime)} - ${formatTimeCompact(turns[i + 1].startTime)}</span>`
			});
		}
		return markers;
	}

	/**
	 * Computes the maximum turn length from the visible data (for scaleToVisibleData mode).
	 */
	private computeMaxTurnLength(data: Record<number, DataPoint[]>): number {
		let max = 1;
		for (const key in data) {
			const words = data[key];
			if (words.length === 0) continue;
			const userData = this.userMap.get(words[0].speaker);
			if (!userData?.user.enabled) continue;
			max = Math.max(max, words.length);
		}
		return max;
	}
}
