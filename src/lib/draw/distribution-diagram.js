import { drawUtils } from './draw-utils.js';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';
export class DistributionDiagram {
	constructor(sk, pos) {
		this.sk = sk;
		this.utils = new drawUtils(sk);
		this.pixelWidth = pos.width;
		this.maxCircleRadius = this.getMaxCircleRadius(this.pixelWidth);
		this.maxCircleArea = Math.PI * this.maxCircleRadius * this.maxCircleRadius;
		this.xPosCurCircle = this.maxCircleRadius; // dynamically updated as circles drawn
		this.xLeft = pos.x;
		this.yPosTop = pos.y;
		this.yPosBottom = pos.height;
		this.yPosHalfHeight = pos.y + (pos.height - pos.y) / 2;
	}

	getMaxCircleRadius(pixelWidth) {
		const currentUsers = get(UserStore);
		return pixelWidth / (currentUsers.length + 1);
	}

	draw(sortedAnimationWordArray) {
		for (const key in sortedAnimationWordArray) {
			if (sortedAnimationWordArray[key].length) {
				const currentUsers = get(UserStore);
				const user = currentUsers.find((user) => user.name === sortedAnimationWordArray[key][0].speaker);
				if (user.enabled) {
					const config = get(ConfigStore);
					this.drawViz(sortedAnimationWordArray[key], config.flowersToggle);
				}
			}
			this.xPosCurCircle += this.maxCircleRadius;
		}
	}

	drawViz(tempTurnArray, isDrawFlower) {
		const firstElement = tempTurnArray[0];
		const metrics = this.calculateMetrics(tempTurnArray);

		const currentUsers = get(UserStore);
		const user = currentUsers.find((user) => user.name === firstElement.speaker);
		const color = this.sk.color(user.color);

		if (isDrawFlower) {
			this.drawFlowerVisualization(color, metrics, tempTurnArray);
		} else {
			this.drawCircleVisualization(firstElement, color, metrics, tempTurnArray);
		}
	}

	calculateMetrics(tempTurnArray) {
		const numOfTurns = this.calculateNumOfTurns(tempTurnArray);
		const numOfWords = tempTurnArray.length;
		return {
			numOfTurns,
			numOfWords,
			scaledWordArea: this.getScaledArea(numOfWords),
			scaledTurnArea: this.getScaledArea(numOfTurns)
		};
	}

	drawCircleVisualization(firstElement, color, metrics, tempTurnArray) {
		const { scaledWordArea, scaledTurnArea, numOfTurns, numOfWords } = metrics;

		this.setColor(color, 120);
		this.sk.circle(this.xPosCurCircle, this.yPosHalfHeight, scaledWordArea);

		this.setColor(color, 255);
		this.sk.circle(this.xPosCurCircle, this.yPosHalfHeight, scaledTurnArea);

		this.drawSpeakerText(firstElement.speaker, numOfTurns, numOfWords);

		if (this.sk.overCircle(this.xPosCurCircle, this.yPosHalfHeight, scaledWordArea)) {
			this.drawWordDetails(tempTurnArray, color);
		}
	}

	drawFlowerVisualization(color, metrics, tempTurnArray) {
		const { scaledWordArea, numOfTurns } = metrics;

		const bottom = this.yPosBottom - this.sk.SPACING;
		const top = this.yPosTop + this.maxCircleRadius;

		const transcript = get(TranscriptStore);
		const scaledNumOfTurns = this.sk.map(numOfTurns, 0, transcript.largestNumOfTurnsByASpeaker, bottom, top);

		this.drawStalkVisualization(scaledWordArea, this.xPosCurCircle, scaledNumOfTurns, color);

		if (this.sk.overCircle(this.xPosCurCircle, scaledNumOfTurns, scaledWordArea)) {
			this.drawWordDetails(tempTurnArray, color);
		}

		this.drawFlowerGuideLines(bottom, top);
	}

	drawStalkVisualization(scaledWordArea, xPos, scaledNumOfTurns, color) {
		this.drawStalk(scaledWordArea / 125, xPos, scaledNumOfTurns);

		this.sk.strokeWeight(1);
		this.setColor(color, 120);
		this.sk.ellipseMode(this.sk.CORNER);

		this.sk.push();
		this.sk.translate(xPos, scaledNumOfTurns);
		this.drawPetals(scaledWordArea / 120);
		this.sk.pop();

		this.sk.ellipseMode(this.sk.CENTER);
	}

	drawFlowerGuideLines(bottom, top) {
		this.sk.stroke(0);
		this.sk.line(this.xLeft, top, this.xLeft, bottom);
		this.sk.line(this.xLeft - this.sk.SPACING / 2, top, this.xLeft + this.sk.SPACING / 2, top);

		this.sk.fill(0);
		this.sk.noStroke();
		this.sk.textSize(16);
		const transcript = get(TranscriptStore);
		this.sk.text(`${transcript.largestNumOfTurnsByASpeaker} Turns`, this.xLeft - this.sk.SPACING / 2, top - this.sk.SPACING / 2);
	}

	drawStalk(scaleFactor, xPos, yPos) {
		this.sk.stroke(85, 107, 47);
		this.sk.strokeWeight(3);
		this.sk.line(xPos, this.yPosBottom - this.sk.SPACING, xPos, yPos + scaleFactor * 45);
	}

	drawPetals(scaleFactor) {
		for (let petal = 0; petal < 10; petal++) {
			this.sk.ellipse(0 * scaleFactor, 10 * scaleFactor, 25 * scaleFactor, 50 * scaleFactor);
			this.sk.rotate(this.sk.PI / 5);
		}
	}

	calculateNumOfTurns(objects) {
		let previousTurnNumber = null;
		let changeCount = 0;
		// Iterate through the array
		objects.forEach((obj) => {
			// Check if 'order' is different from the previous one
			if (obj.turnNumber !== previousTurnNumber) {
				changeCount++;
				previousTurnNumber = obj.turnNumber;
			}
		});
		return changeCount;
	}

	setColor(color, alpha) {
		color.setAlpha(alpha);
		this.sk.noStroke();
		this.sk.fill(color);
	}

	drawSpeakerText(speaker, numOfTurns, wordCount) {
		const textScaling = this.maxCircleRadius / 10;
		this.sk.textSize(textScaling);
		this.sk.strokeWeight(1);
		this.sk.textAlign(this.sk.CENTER);
		this.drawCenteredText(speaker, 0);
		this.drawCenteredText(numOfTurns + ' turns', 1.5 * textScaling);
		this.drawCenteredText(wordCount + ' words', 2.5 * textScaling);
		this.sk.textAlign(this.sk.LEFT);
	}

	drawCenteredText(text, yOffset) {
		this.sk.text(text, this.xPosCurCircle, this.yPosHalfHeight + this.maxCircleRadius + yOffset);
	}

	drawWordDetails(turnArray, speakerColor) {
		this.sk.textSize(this.sk.toolTipTextSize);
		let prevTurnNumber = -1;
		let combined;
		turnArray.forEach((element, index) => {
			if (element.turnNumber !== prevTurnNumber) {
				if (index === 0) combined = element.word.toString();
				else combined = combined.concat(' ', element.word.toString());
				this.sk.sketchController.arrayOfFirstWords.push(element);
				prevTurnNumber = element.turnNumber;
			}
		});
		//this.sk.text(combined, 0 + this.sk.SPACING, this.yPosTop + this.sk.SPACING, this.pixelWidth - this.sk.SPACING, this.yPosHalfHeight - this.maxCircleRadius);
		this.utils.drawTextBox(combined, speakerColor);
	}

	getScaledArea(value) {
		const transcript = get(TranscriptStore);
		const maxValue = transcript.largestNumOfWordsByASpeaker;
		// Normalize the value to a scale of 0 to 1, relative to the maximum value
		const normalizedValue = value / maxValue;
		// Map the normalized value to an area
		const area = normalizedValue * this.maxCircleArea;
		// Calculate the radius from the area
		const radius = Math.sqrt(area / Math.PI);
		return radius;
	}

	getSpeakerFromList(speaker) {
		const hasSameName = (element) => element.name === speaker;
		return this.sk.core.speakerList[this.sk.core.speakerList.findIndex(hasSameName)];
	}
}
