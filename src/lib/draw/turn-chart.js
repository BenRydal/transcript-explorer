import { DrawUtils } from './draw-utils.js';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';

export class TurnChart {
	constructor(sk, pos) {
		this.sk = sk;
		this.utils = new DrawUtils(sk);
		this.xPosBase = pos.x;
		this.pixelWidth = pos.width;
		this.getStores();
		this.verticalLayoutSpacing = this.getVerticalLayoutSpacing(pos.height - this.sk.SPACING);
		this.yPosHalfHeight = pos.y + pos.height / 2;
		this.userSelectedTurn = { turn: '', color: '' };
		this.yPosSeparate = this.getYPosTopSeparate();
	}

	getStores() {
		this.config = get(ConfigStore);
		this.transcript = get(TranscriptStore);
		this.users = get(UserStore);
		this.timeline = get(TimelineStore);
	}

	getYPosTopSeparate() {
		const total = this.users?.length || 0;
		const centerIndex = (total - 1) / 2;
		return this.yPosHalfHeight - centerIndex * this.verticalLayoutSpacing;
	}

	/** Draws the main chart */
	draw(sortedAnimationWordArray) {
		this.drawTimeline();
		this.sk.textSize(this.sk.toolTipTextSize);
		for (const key in sortedAnimationWordArray) {
			if (!sortedAnimationWordArray[key].length) continue;
			const user = this.users.find((u) => u.name === sortedAnimationWordArray[key][0].speaker);
			if (this.testShouldDraw(user, sortedAnimationWordArray[key])) {
				this.drawBubs(sortedAnimationWordArray[key]);
			}
		}
		if (this.userSelectedTurn && this.userSelectedTurn.turn && this.userSelectedTurn.color) {
			this.drawText(this.userSelectedTurn.turn, this.sk.color(this.userSelectedTurn.color));
		}
	}

	testShouldDraw(user, array) {
		const isUserEnabled = user.enabled;
		const shouldDraw = !this.config?.dashboardToggle || this.sk.shouldDraw(array[0], 'turnNumber', 'selectedWordFromContributionCloud');
		let hasSearchWord = true;
		if (this.config.wordToSearch) {
			const combinedString = array.map(({ word }) => word).join(' ');
			hasSearchWord = combinedString.includes(this.config.wordToSearch);
		}
		return isUserEnabled && shouldDraw && hasSearchWord;
	}

	/** Draws the timeline axis */
	drawTimeline() {
		const start = this.xPosBase;
		const end = this.pixelWidth;
		const height = this.yPosHalfHeight;
		const tickLength = this.sk.SPACING / 2;
		this.sk.stroke(0);
		this.sk.fill(0);
		// Draw timeline and ticks
		this.sk.line(start, height - tickLength, start, height + tickLength);
		this.sk.line(end, height - tickLength, end, height + tickLength);
		this.sk.line(start, height, end, height);
	}

	/** Draws turn bubbles */
	drawBubs(turnArray) {
		const turnData = turnArray[0]; // Use meaningful variable name
		const xStart = this.getPixelValueFromTime(turnData.startTime);
		const xEnd = this.getPixelValueFromTime(turnData.endTime);
		const xCenter = xStart + (xEnd - xStart) / 2;
		let [height, yCenter] = this.getCoordinates(turnArray.length, turnData.order);

		// Get speaker color
		const user = this.users.find((u) => u.name === turnData.speaker);
		const speakerColor = user?.color || '#000';

		// Draw bubble
		this.setStrokes(this.sk.color(speakerColor));
		this.sk.ellipse(xCenter, yCenter, xEnd - xStart, height);

		// Handle hover interaction
		if (this.sk.overRect(xStart, yCenter - height / 2, xEnd - xStart, height)) {
			this.userSelectedTurn = { turn: turnArray, color: speakerColor };
		}
	}

	/** Determines the coordinates for turn bubbles */
	getCoordinates(turnLength, order) {
		let height, yCenter;
		if (this.config.separateToggle) {
			height = this.sk.map(turnLength, 0, this.transcript.largestTurnLength, 0, this.verticalLayoutSpacing);
			yCenter = this.yPosSeparate + this.verticalLayoutSpacing * order;
		} else {
			height = this.sk.map(turnLength, 0, this.transcript.largestTurnLength, 0, this.yPosHalfHeight);
			yCenter = this.yPosHalfHeight;
		}
		return [height, yCenter];
	}

	setStrokes(color) {
		this.sk.noStroke();
		color.setAlpha(200);
		this.sk.fill(color);
	}

	drawText(turnArray, speakerColor) {
		const combined = turnArray.map((e) => e.word.toString()).join(' ');
		this.utils.drawTextBox(combined, speakerColor);
	}

	getVerticalLayoutSpacing(height) {
		return height / this.users.length;
	}

	getPixelValueFromTime(timeValue) {
		return this.sk.map(timeValue, this.timeline.getLeftMarker(), this.timeline.getRightMarker(), this.sk.SPACING, this.sk.width - this.sk.SPACING);
	}
}
