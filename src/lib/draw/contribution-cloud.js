import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';

export class ContributionCloud {
	constructor(sk, pos) {
		this.sk = sk;
		this.xPosBase = pos.x;
		this.xPosDynamic = pos.x;
		this.yPosDynamic = pos.y + this.sk.sketchController.scalingVars.spacing;
		this.pixelWidth = pos.width;
		this.prevSpeaker = undefined;
		this.selectedWordFromContributionCloud = undefined;
	}

	draw(index) {
		this.updateCurPos(index);
		this.setScaledTextSize(index.count);
		this.overText(index); // //if (this.sk.sketchController.shouldDraw(index, "turnNumber", "firstWordOfTurnSelectedInTurnChart")) this.drawText(index);

		const shouldDraw = this.sk.sketchController.shouldDraw(index, 'turnNumber', 'firstWordOfTurnSelectedInTurnChart');

		const config = get(ConfigStore);
		if (config.repeatedWordsToggle) {
			if (index.count >= config.repeatWordSliderValue && shouldDraw) {
				this.drawText(index);
			}
		} else {
			if (shouldDraw) {
				this.drawText(index);
			}
		}

		this.updateForNextWord(index);
	}

	drawText(index) {
		this.sk.noStroke();

		const currentUsers = get(UserStore);
		const user = currentUsers.find((user) => user.name === index.speaker);
		const curSpeakerColor = user.color;

		if (!user.enabled) {
			this.sk.fill(255);
		} else {
			let color = 225; // Default color
			if (this.sk.sketchController.selectedWordFromContributionCloud) {
				if (index.word === this.sk.sketchController.selectedWordFromContributionCloud.word) {
					color = curSpeakerColor;
				} else if (index.turnNumber === this.sk.sketchController.selectedWordFromContributionCloud.turnNumber) {
					color = 150;
				}
			} else {
				color = curSpeakerColor;
			}
			this.sk.fill(color);
		}

		this.sk.text(index.word, this.xPosDynamic, this.yPosDynamic);
	}

	overText(index) {
		const boxHeight = this.sk.sketchController.scalingVars.spacing;
		const boxWidth = this.sk.textWidth(index.word);

		const currentUsers = get(UserStore);
		const user = currentUsers.find((user) => user.name === index.speaker);

		if (this.sk.overRect(this.xPosDynamic, this.yPosDynamic - boxHeight, boxWidth, boxHeight) && user.enabled) {
			this.selectedWordFromContributionCloud = index;
			this.sk.videoController.jumpTime = index.startTime;
		}
	}

	// new speaker, new line,
	updateCurPos(index) {
		const config = get(ConfigStore);
		if (config.separateToggle && this.isNewSpeaker(index.speaker)) {
			this.xPosDynamic = this.xPosBase;
			this.yPosDynamic += this.sk.sketchController.scalingVars.newSpeakerSpacing;
		} else if (this.getAdjustedXPos(index) > this.pixelWidth) {
			this.xPosDynamic = this.xPosBase;
			this.yPosDynamic += this.sk.sketchController.scalingVars.spacing;
		}
	}

	updateForNextWord(index) {
		this.xPosDynamic += this.sk.textWidth(index.word + ' '); // Shift x position to draw next word
		this.prevSpeaker = index.speaker;
	}

	setScaledTextSize(count) {
		const config = get(ConfigStore);
		this.sk.textSize(
			this.sk.map(
				count,
				1,
				config.repeatWordSliderValue,
				this.sk.sketchController.scalingVars.minTextSize,
				this.sk.sketchController.scalingVars.maxTextSize,
				true
			)
		);
	}

	getAdjustedXPos(index) {
		this.setScaledTextSize(index.count);
		return this.xPosDynamic + this.sk.textWidth(index.word);
	}

	isNewSpeaker(curSpeaker) {
		return curSpeaker !== this.prevSpeaker;
	}
}
