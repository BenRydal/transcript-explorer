import { drawUtils } from './draw-utils.js';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';

export class TurnChart {
	constructor(sk, pos) {
		this.sk = sk;
		this.utils = new drawUtils(sk);
		this.xPosBase = pos.x;
		this.pixelWidth = pos.width;
		this.yPosTop = pos.y;
		this.yPosHalfHeight = (pos.y + pos.height) / 2;
		this.verticalLayoutSpacing = this.getVerticalLayoutSpacing(pos);
	}

	draw(sortedAnimationWordArray) {
		this.drawTimeline();
		this.sk.textSize(30);
		for (const key in sortedAnimationWordArray) {
			if (sortedAnimationWordArray[key].length) {
				const currentUsers = get(UserStore);
				const user = currentUsers.find((user) => user.name === sortedAnimationWordArray[key][0].speaker);
				if (
					user.enabled &&
					this.sk.sketchController.shouldDraw(sortedAnimationWordArray[key][0], 'turnNumber', 'selectedWordFromContributionCloud')
				) {
					this.drawBubs(sortedAnimationWordArray[key]);
				}
			}
		}
	}

	drawTimeline() {
		const start = this.xPosBase;
		const end = this.pixelWidth;
		const height = this.yPosHalfHeight;
		this.sk.stroke(0);
		this.sk.fill(0);
		this.sk.line(start, height - this.sk.SPACING / 2, start, height + this.sk.SPACING / 2);
		this.sk.line(end, height - this.sk.SPACING / 2, end, height + this.sk.SPACING / 2);
		this.sk.line(start, height, end, height);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.RIGHT);

		//this.sk.text(this.sk.slider.getCurMax(), end, height + this.sk.SPACING); // TODO
		this.sk.textAlign(this.sk.LEFT);
		//this.sk.text(this.sk.slider.getCurMin() + ' seconds', start, height + this.sk.SPACING);
	}

	getSpeakerFromList(speaker) {
		const hasSameName = (element) => element.name === speaker; // condition to satisfy/does it have pathName
		return this.sk.core.speakerList[this.sk.core.speakerList.findIndex(hasSameName)];
	}

	drawBubs(tempTurnArray) {
		const index = tempTurnArray[0];
		const xStart = this.sk.sketchController.getPixelValueFromTime(index.startTime);
		const xEnd = this.sk.sketchController.getPixelValueFromTime(index.endTime);

		const xCenter = xStart + (xEnd - xStart) / 2;
		let [height, yCenter] = this.getCoordinates(tempTurnArray.length, index.order);

		const currentUsers = get(UserStore);
		const user = currentUsers.find((user) => user.name === index.speaker);

		let speakerColor = user.color;
		this.setStrokes(this.sk.color(speakerColor));
		this.sk.ellipse(xCenter, yCenter, xEnd - xStart, height);

		if (this.sk.overRect(xStart, yCenter - height / 2, xEnd - xStart, height)) {
			this.sk.sketchController.firstWordOfTurnSelectedInTurnChart = tempTurnArray[0];
			this.drawText(tempTurnArray, speakerColor);
		}
	}

	getCoordinates(turnLength, order) {
		const transcript = get(TranscriptStore);
		const config = get(ConfigStore);
		let height, yCenter;
		if (config.separateToggle) {
			height = this.sk.map(turnLength, 0, transcript.largestTurnLength, 0, this.verticalLayoutSpacing);
			yCenter = this.yPosTop + this.verticalLayoutSpacing * order;
		} else {
			height = this.sk.map(turnLength, 0, transcript.largestTurnLength, 0, this.yPosHalfHeight);
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
		let combined;
		turnArray.forEach((element, index) => {
			if (index === 0) combined = element.word.toString();
			else combined = combined.concat(' ', element.word.toString());
		});
		this.utils.drawTextBox(combined, speakerColor);
	}

	getVerticalLayoutSpacing(pos) {
		const currentUsers = get(UserStore);
		return (pos.height - pos.y) / (currentUsers.length + 1);
	}
}
