import type p5 from 'p5';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Transcript } from '../../models/transcript';
import type { Timeline } from '../../models/timeline';
import type { Bounds } from './types/bounds';

interface SelectedTurn {
	turn: DataPoint[] | '';
	color: string;
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

	constructor(sk: p5, pos: Bounds) {
		this.sk = sk;
		this.bounds = pos;
		this.config = get(ConfigStore);
		this.transcript = get(TranscriptStore);
		this.users = get(UserStore);
		this.userMap = new Map(this.users.map((user, index) => [user.name, { user, index }]));
		this.timeline = get(TimelineStore);
		this.verticalLayoutSpacing = this.getVerticalLayoutSpacing(pos.height);
		this.yPosHalfHeight = pos.y + pos.height / 2;
		this.userSelectedTurn = { turn: '', color: '' };
		this.yPosSeparate = this.getYPosTopSeparate();
	}

	getYPosTopSeparate(): number {
		const total = this.users?.length || 0;
		const centerIndex = (total - 1) / 2;
		return this.yPosHalfHeight - centerIndex * this.verticalLayoutSpacing;
	}

	/** Draws the main chart */
	draw(sortedAnimationWordArray: Record<number, DataPoint[]>): void {
		this.userSelectedTurn = { turn: '', color: '' }; // Reset each frame
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
		if (this.userSelectedTurn && this.userSelectedTurn.turn && this.userSelectedTurn.color) {
			this.drawText(this.userSelectedTurn.turn as DataPoint[], this.userSelectedTurn.color);
		}
	}

	testShouldDraw(user: User, array: DataPoint[]): boolean {
		const isUserEnabled = user.enabled;
		const shouldDraw = !this.config?.dashboardToggle || this.sk.shouldDraw(array[0]);
		let hasSearchWord = true;
		if (this.config.wordToSearch) {
			const combinedString = array.map(({ word }) => word).join(' ');
			hasSearchWord = combinedString.includes(this.config.wordToSearch);
		}
		return isUserEnabled && shouldDraw && hasSearchWord;
	}

	/** Draws the timeline axis */
	drawTimeline(): void {
		const start = this.bounds.x;
		const end = this.bounds.x + this.bounds.width;
		const height = this.yPosHalfHeight;
		const tickLength = this.sk.SPACING / 2;
		this.sk.stroke(0);
		this.sk.strokeWeight(2);
		this.sk.fill(0);
		// Draw timeline and ticks
		this.sk.line(start, height - tickLength, start, height + tickLength);
		this.sk.line(end, height - tickLength, end, height + tickLength);
		this.sk.line(start, height, end, height);
	}

	/** Draws turn bubbles */
	drawBubs(turnArray: DataPoint[], user: User, speakerIndex: number): void {
		const turnData = turnArray[0];
		const xStart = this.getPixelValueFromTime(turnData.startTime);
		const xEnd = this.getPixelValueFromTime(turnData.endTime);
		const xCenter = xStart + (xEnd - xStart) / 2;

		const [height, yCenter] = this.getCoordinates(turnArray.length, speakerIndex);

		// Draw bubble
		this.setStrokes(this.sk.color(user.color));
		this.sk.ellipse(xCenter, yCenter, xEnd - xStart, height);

		// Handle hover interaction
		if (this.sk.overRect(xStart, yCenter - height / 2, xEnd - xStart, height)) {
			this.userSelectedTurn = { turn: turnArray, color: user.color };
		}
	}

	/** Determines the coordinates for turn bubbles */
	getCoordinates(turnLength: number, speakerIndex: number): [number, number] {
		let height: number, yCenter: number;
		if (this.config.separateToggle) {
			height = this.sk.map(turnLength, 0, this.transcript.largestTurnLength, 0, this.verticalLayoutSpacing);
			yCenter = this.yPosSeparate + this.verticalLayoutSpacing * speakerIndex;
		} else {
			height = this.sk.map(turnLength, 0, this.transcript.largestTurnLength, 0, this.yPosHalfHeight);
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
		const combined = turnArray.map((e) => e.word).join(' ');
		// Use Svelte tooltip instead of p5 drawing
		showTooltip(this.sk.mouseX, this.sk.mouseY, combined, speakerColor, this.sk.height);
	}

	getVerticalLayoutSpacing(height: number): number {
		return height / this.users.length;
	}

	getPixelValueFromTime(timeValue: number): number {
		return this.sk.map(timeValue, this.timeline.leftMarker, this.timeline.rightMarker, this.bounds.x, this.bounds.x + this.bounds.width);
	}
}
