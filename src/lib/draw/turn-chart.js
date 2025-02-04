import { drawUtils } from './draw-utils.js';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';

export class TurnChart {
	constructor(sk, pos) {
		this.sk = sk;
		this.utils = new drawUtils(sk);
		this.xPosBase = pos.x;
		this.pixelWidth = pos.width;
		this.getStores();
		this.verticalLayoutSpacing = this.getVerticalLayoutSpacing(pos.height - this.sk.SPACING);
		this.yPosTop = pos.y + this.sk.SPACING;
		this.yPosHalfHeight = (this.yPosTop + pos.height - this.sk.SPACING) / 2;
	}

	getStores() {
		this.transcript = get(TranscriptStore);
		this.users = get(UserStore);
		this.config = get(ConfigStore);
		this.timeline = get(TimelineStore);
	}

	/** Draws the main chart */
	draw(sortedAnimationWordArray) {
		this.drawTimeline();
		this.sk.textSize(this.sk.toolTipTextSize);
		for (const key in sortedAnimationWordArray) {
			if (!sortedAnimationWordArray[key].length) continue;
			const user = this.users.find((u) => u.name === sortedAnimationWordArray[key][0].speaker);
			if (user?.enabled && this.sk.sketchController.shouldDraw(sortedAnimationWordArray[key][0], 'turnNumber', 'selectedWordFromContributionCloud')) {
				this.drawBubs(sortedAnimationWordArray[key]);
			}
		}
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
		// Labels
		this.sk.noStroke();
		this.sk.textAlign(this.sk.LEFT);
		this.sk.text(this.timeline.getLeftMarker() + ' seconds', start, height + this.sk.SPACING);
		this.sk.textAlign(this.sk.RIGHT);
		this.sk.text(this.timeline.getRightMarker(), end, height + this.sk.SPACING);
		this.sk.textAlign(this.sk.LEFT);
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
			this.sk.sketchController.firstWordOfTurnSelectedInTurnChart = turnArray[0];
			this.drawText(turnArray, speakerColor);
		}
	}

	/** Determines the coordinates for turn bubbles */
	getCoordinates(turnLength, order) {
		let height, yCenter;
		if (this.config.separateToggle) {
			height = this.sk.map(turnLength, 0, this.transcript.largestTurnLength, 0, this.verticalLayoutSpacing);
			yCenter = this.yPosTop + this.verticalLayoutSpacing * order;
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
