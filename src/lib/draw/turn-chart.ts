import type p5 from 'p5';
import { get } from 'svelte/store';
import VideoStore from '../../stores/videoStore';
import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import { CANVAS_SPACING } from '../constants/ui';
import { drawPlayhead, getWordColor } from './draw-utils';
import { DrawContext } from './draw-context';
import { MIN_BUBBLE_SIZE, turnBubbleHeight, capBubbleHeight, bubbleScaleTicks } from './turn-chart-scaling';
import { silentGaps, concurrentSpans, type ActorSpan } from './strip-intervals';
import { actorGroupOf, groupsPresent, groupSizes, ACTOR_GROUP_LABELS, ACTOR_GROUP_COLORS, type ActorGroup } from './actor-groups';
import { isScaleLockEnabled } from '../core/scale-lock';

/**
 * Duration at a precision the value can carry.
 *
 * Rounding everything to whole seconds made a tool call and a marker
 * indistinguishable: both read as 0s or 1s, when the calls themselves run in
 * milliseconds. Below a second the unit is milliseconds, below ten it keeps one
 * decimal, and above a minute it splits so a long agent span stays readable.
 */
function formatDuration(seconds: number): string {
	if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
	if (seconds < 10) return `${seconds.toFixed(1)}s`;
	if (seconds < 60) return `${Math.round(seconds)}s`;
	const m = Math.floor(seconds / 60);
	const r = Math.round(seconds % 60);
	return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

/**
 * Words of a turn shown in the tooltip before it is cut.
 *
 * A single AI turn runs to several thousand words, and the tooltip was built
 * from all of them on every frame the cursor rested on a bubble. The cap is a
 * rendering bound, not a change to the data: word counts, colouring and every
 * other view still read the whole turn.
 */
const TOOLTIP_WORD_LIMIT = 100;

// Vertical padding so bubbles don't touch the top/bottom edges
const VERTICAL_PADDING = 12;

// Annotation strip constants
const STRIP_HEIGHT_RATIO = 0.1;
const MIN_STRIP_HEIGHT = 20;
const MAX_STRIP_HEIGHT = 32;
// Gap bars. Cool grey is the default, and in an AI session marks machine time;
// warm tan marks the human's own gaps. Kept close in saturation so the two read
// as variants of one category rather than unrelated events. Both on both themes.
const GAP_COLOR = '#94a3b8';
const USER_GAP_COLOR = '#c08b5c';
const MARKER_HEIGHT = 8;
const ROW_GAP = 2;
const MIN_MARKER_WIDTH = 2;
// Below this a "gap" is a rounding seam between two rows, not a pause.
const MIN_GAP_SECONDS = 0.75;
const LEGEND_DOT_RADIUS = 5;
const LEGEND_DOT_LEFT_OFFSET = 8;
const LEGEND_DOT_SPACING = 8;

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
	ctx: DrawContext;
	bounds: Bounds;
	userMap: Map<string, { user: User; index: number }>;
	verticalLayoutSpacing: number;
	yPosHalfHeight: number;
	userSelectedTurn: SelectedTurn;
	yPosSeparate: number;
	annotationHover: DataPoint | null = null;
	/**
	 * Time (in transcript seconds) under the cursor when it's over the chart
	 * but not over a specific turn bubble. Lets a click on empty timeline
	 * space play from that point  -  the original "seek to time under cursor"
	 * behavior. Null when the cursor isn't hovering a seekable spot.
	 */
	cursorPlayheadTime: number | null = null;
	private stripBounds: Bounds | null;
	private panelBottom: number;
	/** Turn length that maps to a full-height bubble. */
	private maxTurnLength: number;
	/** AI transcripts size by area; see turn-chart-scaling. */
	private useAreaScaling: boolean;
	/** Clip runaway proportions; see `capBubbleHeight`. */
	private capAspect: boolean;
	/** Lanes stand for participant kinds rather than individual actors. */
	private groupByKind: boolean;
	/** Colour by participant kind without collapsing the lanes. */
	private colorByKind: boolean;
	/** Lanes are drawn separately, either by request or because we are grouping. */
	private separated = false;
	/** Lane index per group, when grouping. */
	private groupIndex: Map<ActorGroup, number> = new Map();
	private groupLabels: string[] = [];

	constructor(ctx: DrawContext, pos: Bounds) {
		this.ctx = ctx;
		const showStrip = this.ctx.transcript.timingMode !== 'untimed' && this.ctx.config.silenceOverlapToggle;
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
		this.userMap = new Map(this.ctx.users.map((user, index) => [user.name, { user, index }]));
		this.verticalLayoutSpacing = this.getVerticalLayoutSpacing(this.bounds.height);
		this.yPosHalfHeight = this.bounds.y + this.bounds.height / 2;
		this.userSelectedTurn = { turn: '', color: '', xCenter: 0, yCenter: 0, width: 0, height: 0 };
		this.yPosSeparate = this.getYPosTopSeparate();
		this.useAreaScaling = this.ctx.transcript.sourceKind === 'ai';
		this.capAspect = this.useAreaScaling && this.ctx.config.turnChartCapAspect !== false;
		this.groupByKind = this.useAreaScaling && this.ctx.config.turnChartGroupByKind === true;
		// Grouping IS a statement about lanes, so it draws lanes.
		this.separated = this.groupByKind || this.ctx.config.separateToggle === true;
		this.colorByKind = this.useAreaScaling && this.ctx.config.turnChartColorByKind === true;
		if (this.groupByKind) this.buildGroups();
		// When scaleToVisibleData is enabled, we'll compute this in draw() from visible data
		this.maxTurnLength = this.ctx.config.scaleToVisibleData ? 0 : this.ctx.transcript.largestTurnLength;
	}

	/** Present groups, their lane order, and a label carrying each one's size. */
	buildGroups(): void {
		const speakers = this.ctx.users.map((u) => u.name);
		const roles = new Map(this.ctx.users.map((u) => [u.name, u.role]));
		const present = groupsPresent(speakers, roles, isScaleLockEnabled());
		const sizes = groupSizes(speakers, roles);
		this.groupIndex = new Map(present.map((g, i) => [g, i]));
		this.groupLabels = present.map((g) => {
			const n = sizes.get(g) ?? 0;
			// A locked lane with no speakers says so, rather than reading as one.
			if (n === 0) return `${ACTOR_GROUP_LABELS[g]} (0)`;
			return n > 1 ? `${ACTOR_GROUP_LABELS[g]} (${n})` : ACTOR_GROUP_LABELS[g];
		});
	}

	/** Lane count actually drawn: groups when grouping, else speakers. */
	private laneCount(): number {
		return this.groupByKind ? Math.max(1, this.groupIndex.size) : this.ctx.users?.length || 0;
	}

	/** Lane index for a speaker, honouring the grouping. */
	private laneIndexFor(speaker: string, speakerIndex: number): number {
		if (!this.groupByKind) return speakerIndex;
		const role = this.userMap.get(speaker)?.user.role;
		return this.groupIndex.get(actorGroupOf(speaker, role)) ?? 0;
	}

	getYPosTopSeparate(): number {
		const total = this.laneCount();
		const centerIndex = (total - 1) / 2;
		return this.yPosHalfHeight - centerIndex * this.verticalLayoutSpacing;
	}

	/** Draws the main chart */
	draw(sortedAnimationWordArray: Record<number, DataPoint[]>): { hoveredSpeaker: string | null } {
		this.userSelectedTurn = { turn: '', color: '', xCenter: 0, yCenter: 0, width: 0, height: 0 }; // Reset each frame
		this.annotationHover = null;

		// Compute max turn length from visible data when scaleToVisibleData is enabled
		if (this.ctx.config.scaleToVisibleData) {
			this.maxTurnLength = this.computeMaxTurnLength(sortedAnimationWordArray);
		}

		this.drawTimeline();
		if (this.separated) this.drawTimeGridlines();
		if (this.groupByKind) this.drawGroupLabels();
		if (this.useAreaScaling && !this.separated) this.drawScaleTicks();
		this.ctx.sk.textSize(this.ctx.sk.toolTipTextSize);
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
			this.ctx.sk.noFill();
			this.ctx.sk.stroke(sel.color);
			this.ctx.sk.strokeWeight(2);
			this.ctx.sk.ellipse(sel.xCenter, sel.yCenter, sel.width, sel.height);
			this.drawText(sel.turn as DataPoint[], sel.color);
		}
		if (this.stripBounds) {
			this.drawAnnotationStrip(sortedAnimationWordArray);
		}

		// Playhead: video playing → video time, animating → animation time, otherwise → follow mouse
		const videoState = get(VideoStore);
		const isTimed = this.ctx.transcript.timingMode !== 'untimed';
		const playheadRegion: Bounds = { x: this.bounds.x, y: this.bounds.y, width: this.bounds.width, height: this.panelBottom - this.bounds.y };
		let playheadTime: number | null = null;
		if (videoState.isLoaded && videoState.isPlaying && isTimed) {
			playheadTime = videoState.currentTime;
		} else if (this.ctx.timeline.isAnimating) {
			playheadTime = this.ctx.timeline.currTime;
		} else if (this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.panelBottom - this.bounds.y)) {
			const frac = (this.ctx.sk.mouseX - this.bounds.x) / this.bounds.width;
			playheadTime = this.ctx.timeline.leftMarker + frac * (this.ctx.timeline.rightMarker - this.ctx.timeline.leftMarker);
		}
		if (playheadTime !== null) {
			drawPlayhead(this.ctx.sk, playheadTime, this.ctx.timeline.leftMarker, this.ctx.timeline.rightMarker, playheadRegion);
		}

		// Capture the time under the cursor so a click on empty timeline space
		// (no bubble) still plays from there. Only meaningful when timed and the
		// cursor is actually over the chart region.
		if (isTimed && this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.panelBottom - this.bounds.y)) {
			const frac = (this.ctx.sk.mouseX - this.bounds.x) / this.bounds.width;
			this.cursorPlayheadTime = this.ctx.timeline.leftMarker + frac * (this.ctx.timeline.rightMarker - this.ctx.timeline.leftMarker);
		} else {
			this.cursorPlayheadTime = null;
		}

		const turn = this.userSelectedTurn.turn;
		const hoveredTurnPoint = turn ? (turn as DataPoint[])[0] : null;
		return { hoveredSpeaker: hoveredTurnPoint?.speaker ?? null };
	}

	testShouldDraw(user: User, array: DataPoint[]): boolean {
		if (!user.enabled) return false;
		const mouseInPanel = this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
		if (this.ctx.config.dashboardToggle && !mouseInPanel && !this.ctx.sk.shouldDraw(array[0])) return false;
		if (this.ctx.config.wordToSearch) {
			const combinedString = array.map(({ word }) => word).join(' ');
			if (!combinedString.includes(this.ctx.config.wordToSearch)) return false;
		}
		return true;
	}

	/** Draws the timeline axis */
	drawTimeline(): void {
		const start = this.bounds.x;
		const end = this.bounds.x + this.bounds.width;
		const y = this.yPosHalfHeight;
		const tickLength = CANVAS_SPACING / 2;
		const theme = this.ctx.theme;
		this.ctx.sk.stroke(theme.fg);
		this.ctx.sk.strokeWeight(2);
		this.ctx.sk.fill(theme.fg);
		// Draw timeline and ticks
		this.ctx.sk.line(start, y - tickLength, start, y + tickLength);
		this.ctx.sk.line(end, y - tickLength, end, y + tickLength);
		this.ctx.sk.line(start, y, end, y);

		// Time labels
		const isUntimed = this.ctx.transcript.timingMode === 'untimed';
		if (isUntimed) return;
		const numTicks = Math.min(8, Math.floor(this.bounds.width / 60));
		this.ctx.sk.textSize(Math.max(10, Math.min(13, this.bounds.height * 0.035)));
		this.ctx.sk.fill(theme.fg);
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.TOP);
		const duration = this.ctx.timeline.rightMarker - this.ctx.timeline.leftMarker;
		for (let i = 0; i <= numTicks; i++) {
			const frac = i / numTicks;
			const time = this.ctx.timeline.leftMarker + frac * duration;
			const x = start + frac * this.bounds.width;
			// Tick mark
			this.ctx.sk.stroke(theme.fg);
			this.ctx.sk.strokeWeight(1);
			this.ctx.sk.line(x, y, x, y + tickLength);
			// Label
			this.ctx.sk.noStroke();
			this.ctx.sk.text(formatTimeCompact(time), x, y + tickLength + 2);
		}
	}

	/** Names each grouped lane, with how many actors it stands for. */
	drawGroupLabels(): void {
		const sk = this.ctx.sk;
		sk.push();
		sk.noStroke();
		sk.textAlign(sk.LEFT, sk.CENTER);
		sk.textSize(Math.max(9, Math.min(12, this.bounds.height * 0.03)));
		this.groupLabels.forEach((label, i) => {
			sk.fill(this.ctx.theme.fgMuted);
			sk.text(label, this.bounds.x + 4, this.yPosSeparate + this.verticalLayoutSpacing * i);
		});
		sk.pop();
	}

	/** Faint verticals at the axis ticks, drawn only with lanes separated. */
	drawTimeGridlines(): void {
		const isUntimed = this.ctx.transcript.timingMode === 'untimed';
		if (isUntimed) return;

		const sk = this.ctx.sk;
		const numTicks = Math.min(8, Math.floor(this.bounds.width / 60));
		if (numTicks <= 0) return;

		const rule = sk.color(this.ctx.theme.fgMuted);
		rule.setAlpha(26);
		sk.push();
		sk.stroke(rule);
		sk.strokeWeight(1);
		for (let i = 0; i <= numTicks; i++) {
			const x = this.bounds.x + (i / numTicks) * this.bounds.width;
			sk.line(x, this.bounds.y, x, this.bounds.y + this.bounds.height);
		}
		sk.pop();
	}

	/** Hairlines at round word counts, so a bubble's height reads as a quantity. */
	drawScaleTicks(): void {
		const ticks = bubbleScaleTicks(this.maxTurnLength, this.bounds.height, true);
		if (ticks.length === 0) return;

		const sk = this.ctx.sk;
		const x = this.bounds.x;
		sk.push();
		sk.textAlign(sk.LEFT, sk.BOTTOM);
		sk.textSize(9);
		for (const tick of ticks) {
			const y = this.yPosHalfHeight - tick.halfHeight;
			const rule = sk.color(this.ctx.theme.fgMuted);
			rule.setAlpha(38);
			sk.stroke(rule);
			sk.strokeWeight(1);
			sk.line(x, y, x + this.bounds.width, y);

			sk.noStroke();
			sk.fill(this.ctx.theme.fgMuted);
			sk.text(tick.words >= 1000 ? `${tick.words / 1000}k` : String(tick.words), x + 3, y - 1);
		}
		sk.pop();
	}

	/** Draws turn bubbles */
	drawBubs(turnArray: DataPoint[], user: User, speakerIndex: number): void {
		const turnData = turnArray[0];
		const xStart = this.getPixelValueFromTime(turnData.startTime);
		const xEnd = this.getPixelValueFromTime(turnData.endTime);
		// A brief turn inside a long session is sub-pixel wide however long it is,
		// so the floor applies on this axis too. Centred on the true midpoint so
		// widening it doesn't shift the bubble off its own time span.
		const width = this.useAreaScaling ? Math.max(MIN_BUBBLE_SIZE, xEnd - xStart) : xEnd - xStart;
		const xCenter = (xStart + xEnd) / 2;
		const [height, yCenter] = this.getCoordinates(turnArray.length, this.laneIndexFor(turnData.speaker, speakerIndex));

		// A turn with far more words than duration draws as a needle whose most
		// striking dimension came from a fallback constant.
		const capped = this.capAspect ? capBubbleHeight(height, width) : { height, capped: false };
		const drawnHeight = capped.height;

		const color =
			this.groupByKind || this.colorByKind
				? ACTOR_GROUP_COLORS[actorGroupOf(user.name, user.role)]
				: getWordColor(turnData.codes, user.color, this.ctx.codeColorMap, this.ctx.config.codeColorMode);
		this.setStrokes(this.ctx.sk.color(color));
		this.ctx.sk.ellipse(xCenter, yCenter, width, drawnHeight);
		if (capped.capped) this.drawCapMarks(xCenter, yCenter, width, drawnHeight, color);

		if (this.ctx.sk.overRect(xCenter - width / 2, yCenter - drawnHeight / 2, width, drawnHeight)) {
			this.userSelectedTurn = { turn: turnArray, color, xCenter, yCenter, width, height: drawnHeight };
		}
	}

	/** Notches a clipped mark top and bottom, so it reads as off the scale. */
	drawCapMarks(xCenter: number, yCenter: number, width: number, height: number, color: string): void {
		const sk = this.ctx.sk;
		const half = Math.max(2, Math.min(width, 10)) / 2;
		sk.push();
		sk.stroke(color);
		sk.strokeWeight(1.5);
		sk.noFill();
		sk.line(xCenter - half, yCenter - height / 2, xCenter + half, yCenter - height / 2);
		sk.line(xCenter - half, yCenter + height / 2, xCenter + half, yCenter + height / 2);
		sk.pop();
	}

	/** Determines the coordinates for turn bubbles */
	getCoordinates(turnLength: number, speakerIndex: number): [number, number] {
		let lane: number, yCenter: number;
		if (this.separated) {
			lane = this.verticalLayoutSpacing;
			yCenter = this.yPosSeparate + this.verticalLayoutSpacing * speakerIndex;
		} else {
			lane = this.bounds.height;
			yCenter = this.yPosHalfHeight;
		}
		return [turnBubbleHeight(turnLength, this.maxTurnLength, lane, this.useAreaScaling), yCenter];
	}

	setStrokes(color: p5.Color): void {
		this.ctx.sk.noStroke();
		color.setAlpha(200);
		this.ctx.sk.fill(color);
	}

	drawText(turnArray: DataPoint[], speakerColor: string): void {
		const speaker = turnArray[0].speaker;
		const provenance = turnArray[0].provenance;
		const truncated = turnArray.length > TOOLTIP_WORD_LIMIT;
		const shown = truncated ? turnArray.slice(0, TOOLTIP_WORD_LIMIT) : turnArray;
		const combined =
			shown.map((e) => e.word).join(' ') +
			(truncated ? ` <span style="opacity: 0.6">... ${turnArray.length - TOOLTIP_WORD_LIMIT} more words</span>` : '');
		// Under area scaling the bubble is no longer a direct readout of turn
		// length, so the exact count belongs in the tooltip.
		const heading = this.useAreaScaling
			? `<b>${speaker}</b> <span style="font-size: 0.85em; opacity: 0.7">· ${turnArray.length} words</span>`
			: `<b>${speaker}</b>`;
		// Most agentic durations were never measured. Encoding that in the mark
		// read as a rendering fault, so it lives here.
		const note =
			provenance !== undefined && provenance !== 'measured'
				? `\n<span style="font-size: 0.85em; opacity: 0.7">Duration ${provenance === 'marker' ? 'not recorded' : 'estimated'}</span>`
				: '';
		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, `${heading}\n${combined}${note}`, speakerColor, this.panelBottom);
	}

	getVerticalLayoutSpacing(height: number): number {
		return height / Math.max(1, this.laneCount());
	}

	getPixelValueFromTime(timeValue: number): number {
		return this.ctx.sk.map(timeValue, this.ctx.timeline.leftMarker, this.ctx.timeline.rightMarker, this.bounds.x, this.bounds.x + this.bounds.width);
	}

	// ---- Annotation Strip ----

	private drawAnnotationStrip(turnData: Record<number, DataPoint[]>): void {
		const strip = this.stripBounds!;
		const topRowY = strip.y + (strip.height - MARKER_HEIGHT * 2 - ROW_GAP) / 2;
		const bottomRowY = topRowY + MARKER_HEIGHT + ROW_GAP;

		// Separator line
		this.ctx.sk.stroke(this.ctx.theme.border);
		this.ctx.sk.strokeWeight(1);
		this.ctx.sk.line(strip.x, strip.y, strip.x + strip.width, strip.y);

		// Build turn ranges from the data we already have
		const turns = this.getTurnRanges(turnData);
		const markers = [...this.buildOverlapMarkers(turns, topRowY), ...this.buildGapMarkers(turns, bottomRowY)];

		// Legend dots. An AI session splits the gap row into human and machine time,
		// so its key carries both colours rather than leaving one unexplained.
		const overlapColor = this.ctx.theme.danger;
		const dotX = strip.x + LEGEND_DOT_LEFT_OFFSET;
		this.ctx.sk.noStroke();
		this.ctx.sk.fill(overlapColor);
		this.ctx.sk.ellipse(dotX, topRowY + MARKER_HEIGHT / 2, LEGEND_DOT_RADIUS, LEGEND_DOT_RADIUS);
		const gapKey = this.ctx.transcript.sourceKind === 'ai' ? [USER_GAP_COLOR, GAP_COLOR] : [GAP_COLOR];
		gapKey.forEach((c, i) => {
			this.ctx.sk.fill(c);
			this.ctx.sk.ellipse(dotX + i * LEGEND_DOT_SPACING, bottomRowY + MARKER_HEIGHT / 2, LEGEND_DOT_RADIUS, LEGEND_DOT_RADIUS);
		});

		// Draw markers
		this.ctx.sk.noStroke();
		for (const m of markers) {
			const c = this.ctx.sk.color(m.color);
			c.setAlpha(180);
			this.ctx.sk.fill(c);
			this.ctx.sk.rect(m.x, m.y, m.w, m.h, 2);
		}

		// Hover
		if (this.ctx.sk.overRect(strip.x, strip.y, strip.width, strip.height)) {
			for (const m of markers) {
				if (this.ctx.sk.overRect(m.x, m.y, m.w, m.h)) {
					this.ctx.sk.noFill();
					this.ctx.sk.stroke(m.color);
					this.ctx.sk.strokeWeight(2);
					this.ctx.sk.rect(m.x - 1, m.y - 1, m.w + 2, m.h + 2, 2);
					showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, m.tooltipContent, m.color, this.panelBottom);
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

	/**
	 * Wording for temporal relations between turns.
	 *
	 * In conversation these are interactional events: two people talking at once
	 * is an overlap, a gap is silence. In an agentic session they are execution
	 * facts — sub-agents run in parallel by design, and a gap is the model
	 * working. Naming them as interruption and silence there reports a
	 * scheduling artefact as conversational conduct.
	 */
	private get overlapLabel(): string {
		return this.ctx.transcript.sourceKind === 'ai' ? 'Concurrent' : 'Overlap';
	}

	/**
	 * Whether a speaker is the human participant.
	 *
	 * Relies on the role precedence in source-kind.ts: a delegated sub-agent also
	 * carries a `user` row, for the prompt it was handed, so first-role-seen would
	 * report sub-agents as people. Undefined for human transcripts, where every
	 * speaker is a person and the distinction is meaningless.
	 */
	private isHumanSpeaker(speaker: string): boolean {
		return this.userMap.get(speaker)?.user.role === 'user';
	}

	/**
	 * A gap belongs to whoever speaks next — they are the party preparing during
	 * it.
	 *
	 * For an AI session that split is the point: the pause before a prompt is the
	 * person reading and composing, the pause before a model turn is inference.
	 * Reporting both as the model's latency attributes the researcher's own
	 * thinking time to the machine. In the bundled sessions the human's share of
	 * gap time is a clear minority but never negligible, which is what makes the
	 * second colour worth its cost.
	 *
	 * Tool execution is deliberately not a third case, but that call is provisional.
	 * A gap before a `tool_call` is the model deciding what to call rather than the
	 * tool running, and gaps before an actual `tool_result` are currently a small
	 * enough share not to earn their own colour. That share is an artefact of how
	 * the converter times rows: it stretches every event to meet the next one, so
	 * the only gaps that survive are the long ones it leaves deliberately, and a
	 * tool's real execution time stays hidden inside its own bar. Once the converter
	 * emits measured durations, tool time will surface as gaps and this should be
	 * measured again — see tools/claude-code-converter.
	 */
	private gapAttribution(nextSpeaker: string): { label: string; color: string } {
		if (this.ctx.transcript.sourceKind !== 'ai') return { label: 'Silence', color: GAP_COLOR };
		if (this.isHumanSpeaker(nextSpeaker)) return { label: 'User thinking', color: USER_GAP_COLOR };
		return { label: 'Model working', color: GAP_COLOR };
	}

	/** One band per stretch of parallel work, not one per pair of speakers. */
	private buildOverlapMarkers(turns: TurnRange[], rowY: number): AnnotationMarker[] {
		const markers: AnnotationMarker[] = [];
		const isAi = this.ctx.transcript.sourceKind === 'ai';
		const spans: ActorSpan[] = turns
			.filter((t) => !isAi || !this.isHumanSpeaker(t.speaker))
			.map((t) => ({ speaker: t.speaker, start: t.startTime, end: t.endTime }));

		for (const span of concurrentSpans(spans, 2, MIN_GAP_SECONDS)) {
			const x = this.getPixelValueFromTime(span.start);
			const xEnd = this.getPixelValueFromTime(span.end);
			const duration = span.end - span.start;
			markers.push({
				x,
				w: Math.max(MIN_MARKER_WIDTH, xEnd - x),
				y: rowY,
				h: MARKER_HEIGHT,
				color: this.ctx.theme.danger,
				firstDataPoint: turns[0].firstDataPoint,
				tooltipContent: `<b>${this.overlapLabel} · ${formatDuration(duration)}</b>\n<span style="font-size: 0.85em; opacity: 0.7">${span.peak} at once\n${formatTimeCompact(span.start)} - ${formatTimeCompact(span.end)}</span>`
			});
		}
		return markers;
	}

	/** Silence is where nothing is active: the complement of the merged turns. */
	private buildGapMarkers(turns: TurnRange[], rowY: number): AnnotationMarker[] {
		const markers: AnnotationMarker[] = [];
		const spans = turns.map((t) => ({ start: t.startTime, end: t.endTime }));
		const from = this.ctx.timeline.leftMarker;
		const to = this.ctx.timeline.rightMarker;

		for (const gap of silentGaps(spans, from, to, MIN_GAP_SECONDS)) {
			const gapDuration = gap.end - gap.start;
			// Whoever speaks next owns the pause; they are the party preparing.
			const next = turns.find((t) => t.startTime >= gap.end);
			const previous = [...turns].reverse().find((t) => t.endTime <= gap.start);
			const x = this.getPixelValueFromTime(gap.start);
			const xEnd = this.getPixelValueFromTime(gap.end);
			const { label, color } = this.gapAttribution(next?.speaker ?? '');
			markers.push({
				x,
				w: Math.max(MIN_MARKER_WIDTH, xEnd - x),
				y: rowY,
				h: MARKER_HEIGHT,
				color,
				firstDataPoint: (previous ?? next ?? turns[0]).firstDataPoint,
				tooltipContent: `<b>${label} · ${formatDuration(gapDuration)}</b>\n<span style="font-size: 0.85em; opacity: 0.7">nobody active\n${formatTimeCompact(gap.start)} - ${formatTimeCompact(gap.end)}</span>`
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
