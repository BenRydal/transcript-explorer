import { DrawUtils } from './draw-utils.js';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';
export class DistributionDiagram {
	constructor(sk, pos) {
		this.sk = sk;
		this.users = get(UserStore);
		this.config = get(ConfigStore);
		const transcript = get(TranscriptStore);
		this.largestNumOfWordsByASpeaker = transcript.largestNumOfWordsByASpeaker;
		this.largestNumOfTurnsByASpeaker = transcript.largestNumOfTurnsByASpeaker;
		this.localArrayOfFirstWords = [];
		this.utils = new DrawUtils(sk);
		this.pixelWidth = pos.width;
		this.maxCircleRadius = this.getMaxCircleRadius(this.pixelWidth);
		this.maxCircleArea = Math.PI * this.maxCircleRadius * this.maxCircleRadius;
		this.xPosCurCircle = this.maxCircleRadius; // dynamically updated as circles drawn
		this.xLeft = pos.x;
		this.yPosTop = pos.y;
		this.yPosBottom = pos.height;
		this.yPosHalfHeight = pos.y + (pos.height - pos.y) / 2;
	}

	draw(sortedAnimationWordArray) {
		for (const key in sortedAnimationWordArray) {
			if (sortedAnimationWordArray[key].length) {
				const user = this.users.find((user) => user.name === sortedAnimationWordArray[key][0].speaker);
				if (user.enabled) {
					this.drawViz(sortedAnimationWordArray[key], this.config.flowersToggle);
				}
			}
			this.xPosCurCircle += this.maxCircleRadius;
		}
	}

	drawViz(tempTurnArray, isDrawFlower) {
		const firstElement = tempTurnArray[0];
		const metrics = this.calculateMetrics(tempTurnArray);
		const user = this.users.find((user) => user.name === firstElement.speaker);
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
			this.drawFirstWords(tempTurnArray, color);
		}
	}

	drawFlowerVisualization(color, metrics, tempTurnArray) {
		const { scaledWordArea, numOfTurns } = metrics;

		const bottom = this.yPosBottom - this.sk.SPACING;
		const top = this.yPosTop + this.maxCircleRadius;

		const scaledNumOfTurns = this.sk.map(numOfTurns, 0, this.largestNumOfTurnsByASpeaker, bottom, top);

		this.drawStalkVisualization(scaledWordArea, this.xPosCurCircle, scaledNumOfTurns, color);

		if (this.sk.overCircle(this.xPosCurCircle, scaledNumOfTurns, scaledWordArea)) {
			this.drawFirstWords(tempTurnArray, color);
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
		this.sk.text(`${this.largestNumOfTurnsByASpeaker} Turns`, this.xLeft - this.sk.SPACING / 2, top - this.sk.SPACING / 2);
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

	// Calculates the number of unique turns in an array of objects. A "turn" is counted each time the `turnNumber` changes from the previous object.
	calculateNumOfTurns(objects) {
		return objects.reduce((count, obj, index, arr) => {
			return index > 0 && obj.turnNumber === arr[index - 1].turnNumber ? count : count + 1;
		}, 0);
	}

	setColor(color, alpha) {
		color.setAlpha(alpha);
		this.sk.noStroke();
		this.sk.fill(color);
	}

	drawSpeakerText(speaker, numOfTurns, wordCount) {
		this.sk.textSize(this.sk.toolTipTextSize / 2);
		this.sk.strokeWeight(1);
		this.sk.textAlign(this.sk.CENTER);
		const text = speaker + '\n' + numOfTurns + ' turns' + '\n' + wordCount + ' words';
		this.sk.text(text, this.xPosCurCircle - this.maxCircleRadius / 2, this.yPosHalfHeight + this.maxCircleRadius / 1.5, this.maxCircleRadius);
		this.sk.textAlign(this.sk.LEFT);
	}

	drawFirstWords(turnArray, speakerColor) {
		this.sk.textSize(this.sk.toolTipTextSize);
		const firstWords = new Set();
		const wordsToDisplay = [];

		turnArray.forEach((element) => {
			if (!firstWords.has(element.turnNumber)) {
				firstWords.add(element.turnNumber);
				this.localArrayOfFirstWords.push(element);
				wordsToDisplay.push(element.word);
			}
		});
		const combined = wordsToDisplay.join(' ');
		this.utils.drawTextBox(combined, speakerColor);
	}

	getMaxCircleRadius(pixelWidth) {
		return pixelWidth / (this.users.length + 1);
	}

	getScaledArea(value) {
		const maxValue = this.largestNumOfWordsByASpeaker;
		// Normalize the value to a scale of 0 to 1, relative to the maximum value
		const normalizedValue = value / maxValue;
		// Map the normalized value to an area
		const area = normalizedValue * this.maxCircleArea;
		// Calculate the radius from the area
		const radius = Math.sqrt(area / Math.PI);
		return radius;
	}
}
