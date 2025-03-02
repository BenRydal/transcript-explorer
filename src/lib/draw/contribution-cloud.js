import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';

export class ContributionCloud {
	constructor(sk, pos) {
		this.sk = sk;
		this.getStores();
		this.xPosBase = pos.x;
		this.xPosDynamic = pos.x;
		this.yPosDynamic = pos.y + this.config.scalingVars.spacing;
		this.pixelWidth = pos.width;
		this.prevSpeaker = undefined;
		this.selectedWordFromContributionCloud = ''; // Used to highlight words in contribution cloud
	}

	getStores() {
		this.users = get(UserStore);
		this.config = get(ConfigStore);
	}

	draw(curAnimationArray) {
		for (const index of curAnimationArray) {
			const user = this.users.find((user) => user.name === index.speaker);
			this.sk.noStroke();
			this.updateCurPos(index);
			this.setScaledTextSize(index.count);
			if (this.testShouldDraw(index)) {
				this.drawText(index, user);
				if (user.enabled) this.overText(index);
			}
			this.updateForNextWord(index);
		}
	}

	drawText(index, user) {
		if (!user.enabled) {
			this.sk.fill(255);
			this.sk.text(index.word, this.xPosDynamic, this.yPosDynamic);
			return;
		}
		this.setTextColor(user.color, index);
		this.sk.text(index.word, this.xPosDynamic, this.yPosDynamic);
	}

	overText(index) {
		const boxHeight = this.config.scalingVars.spacing;
		const boxWidth = this.sk.textWidth(index.word);
		if (this.sk.overRect(this.xPosDynamic, this.yPosDynamic - boxHeight, boxWidth, boxHeight)) {
			this.selectedWordFromContributionCloud = index;
		}
	}

	// Sets correct spacing for new speaker and if line goes beyond screen width
	updateCurPos(index) {
		if (this.config.separateToggle && this.isNewSpeaker(index.speaker)) {
			this.xPosDynamic = this.xPosBase;
			this.yPosDynamic += this.config.scalingVars.newSpeakerSpacing;
		} else if (this.getAdjustedXPos(index) > this.pixelWidth) {
			this.xPosDynamic = this.xPosBase;
			this.yPosDynamic += this.config.scalingVars.spacing;
		}
	}

	updateForNextWord(index) {
		this.xPosDynamic += this.sk.textWidth(index.word + ' ');
		this.prevSpeaker = index.speaker;
	}

	setScaledTextSize(count) {
		this.sk.textSize(
			this.sk.map(count, 1, this.config.repeatWordSliderValue, this.config.scalingVars.minTextSize, this.config.scalingVars.maxTextSize, true)
		);
	}

	getAdjustedXPos(index) {
		return this.xPosDynamic + this.sk.textWidth(index.word);
	}

	isNewSpeaker(curSpeaker) {
		return curSpeaker !== this.prevSpeaker;
	}

	testShouldDraw(index) {
		const shouldDraw = !this.config?.dashboardToggle || this.sk.shouldDraw(index, 'turnNumber', 'firstWordOfTurnSelectedInTurnChart');
		const isRepeat = !this.config.repeatedWordsToggle || index.count >= this.config.repeatWordSliderValue;
		const hasSearchWord = !this.config.wordToSearch || index.word.includes(this.config.wordToSearch);
		return shouldDraw && isRepeat && hasSearchWord;
	}

	setTextColor(userColor, index) {
		let color = 225; // Default color
		const selectedWord = this.config.selectedWordFromContributionCloud;
		if (selectedWord) {
			if (index.word === selectedWord.word) {
				color = userColor; // Highlight same word
			} else if (index.turnNumber === selectedWord.turnNumber) {
				color = 150; // Dim other words in the same turn
			}
		} else {
			color = userColor;
		}
		this.sk.fill(color);
	}
}
