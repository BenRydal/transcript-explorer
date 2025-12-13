import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';
import { showTooltip } from '../../stores/tooltipStore';

// Flower drawing constants
const STALK_LEAF_COLORS = {
	outer: [65, 105, 45, 200],
	inner: [85, 130, 55, 150],
	vein: [50, 80, 35, 180]
};
const STALK_BASE_COLOR = [55, 85, 35];
const NUM_PETALS = 11;
const GRADIENT_STEPS = 6;

export class DistributionDiagram {
	constructor(sk, pos) {
		this.sk = sk;
		this.users = get(UserStore);
		this.config = get(ConfigStore);
		const transcript = get(TranscriptStore);
		this.largestNumOfWordsByASpeaker = transcript.largestNumOfWordsByASpeaker;
		this.largestNumOfTurnsByASpeaker = transcript.largestNumOfTurnsByASpeaker;
		this.localArrayOfFirstWords = [];
		this.pixelWidth = pos.width;
		this.maxCircleRadius = this.getMaxCircleRadius(this.pixelWidth);
		this.maxCircleArea = Math.PI * this.maxCircleRadius * this.maxCircleRadius;
		this.xPosCurCircle = this.maxCircleRadius; // dynamically updated as circles drawn
		this.xLeft = pos.x;
		this.yPosTop = pos.y;
		this.yPosBottom = pos.height;
		this.yPosHalfHeight = pos.y + (pos.height - pos.y) / 2;
		this.isHovering = false; // Track if any circle is being hovered
	}

	draw(sortedAnimationWordArray) {
		for (const key in sortedAnimationWordArray) {
			if (sortedAnimationWordArray[key].length) {
				const user = this.users.find((user) => user.name === sortedAnimationWordArray[key][0].speaker);
				if (user?.enabled) {
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
		if (!user) return; // Guard against missing user
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

		if (this.sk.overCircle(this.xPosCurCircle, this.yPosHalfHeight, scaledWordArea)) {
			this.drawSpeakerTooltip(firstElement.speaker, numOfTurns, numOfWords, tempTurnArray, color);
		}
	}

	drawFlowerVisualization(color, metrics, tempTurnArray) {
		const { scaledWordArea, numOfTurns, numOfWords } = metrics;
		const speaker = tempTurnArray[0]?.speaker || '';

		const bottom = this.yPosBottom - this.sk.SPACING;
		const top = this.yPosTop + this.maxCircleRadius;

		const scaledNumOfTurns = this.sk.map(numOfTurns, 0, this.largestNumOfTurnsByASpeaker, bottom, top);

		this.drawStalkVisualization(scaledWordArea, this.xPosCurCircle, scaledNumOfTurns, color);

		if (this.sk.overCircle(this.xPosCurCircle, scaledNumOfTurns, scaledWordArea)) {
			this.drawSpeakerTooltip(speaker, numOfTurns, numOfWords, tempTurnArray, color);
		}

		this.drawFlowerGuideLines(bottom, top);
	}

	drawStalkVisualization(scaledWordArea, xPos, yPos, color) {
		const scaleFactor = scaledWordArea / 100;

		this.drawStalk(scaleFactor, xPos, yPos);

		this.sk.push();
		this.sk.translate(xPos, yPos);
		this.drawPetals(scaleFactor, color);
		this.sk.pop();
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
		const bottomY = this.yPosBottom - this.sk.SPACING;
		// Connect directly to flower center (yPos is where flower is drawn)
		const topY = yPos;
		const stalkHeight = bottomY - topY;

		// Create natural S-curve with more pronounced bends
		const bendAmount = scaleFactor * 12 + stalkHeight * 0.03;

		// Draw stalk with gradient thickness (thicker at bottom)
		this.sk.noFill();

		// Draw multiple strokes for thickness gradient effect
		for (let i = 0; i < 3; i++) {
			const thickness = Math.max(2, scaleFactor * 3.5) - i * 0.5;
			const [r, g, b] = STALK_BASE_COLOR;
			this.sk.stroke(r + i * 15, g + i * 10, b + i * 5, 255 - i * 30);
			this.sk.strokeWeight(thickness);

			// More organic S-curve - end at flower center
			this.sk.bezier(
				xPos, bottomY,
				xPos + bendAmount * 0.8, bottomY - stalkHeight * 0.25,
				xPos - bendAmount, bottomY - stalkHeight * 0.6,
				xPos, topY  // End exactly at flower center (no x offset)
			);
		}

		// Draw realistic leaves at multiple points along the stalk
		if (scaleFactor > 0.25) {
			// Lower leaf (larger, pointing right)
			const leaf1Y = bottomY - stalkHeight * 0.3;
			const leaf1X = this.getStalkX(xPos, bendAmount, 0.3, stalkHeight);
			this.drawRealisticLeaf(leaf1X, leaf1Y, scaleFactor * 1.2, 0.4, false);

			// Upper leaf (smaller, pointing left)
			if (stalkHeight > 80) {
				const leaf2Y = bottomY - stalkHeight * 0.55;
				const leaf2X = this.getStalkX(xPos, bendAmount, 0.55, stalkHeight);
				this.drawRealisticLeaf(leaf2X, leaf2Y, scaleFactor * 0.9, -0.3, true);
			}

			// Small bud leaf near flower (if tall enough)
			if (stalkHeight > 120) {
				const leaf3Y = bottomY - stalkHeight * 0.78;
				const leaf3X = this.getStalkX(xPos, bendAmount, 0.78, stalkHeight);
				this.drawRealisticLeaf(leaf3X, leaf3Y, scaleFactor * 0.6, 0.5, false);
			}
		}
	}

	getStalkX(baseX, bendAmount, t, stalkHeight) {
		// Approximate the bezier curve x position at parameter t
		const p0 = baseX;
		const p1 = baseX + bendAmount * 0.8;
		const p2 = baseX - bendAmount;
		const p3 = baseX; // End at center (no offset)

		// Cubic bezier formula
		const mt = 1 - t;
		return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
	}

	drawRealisticLeaf(x, y, scale, rotation, flipX) {
		this.sk.push();
		this.sk.translate(x, y);
		this.sk.rotate(rotation);
		if (flipX) this.sk.scale(-1, 1);

		// Outer leaf shape
		this.sk.fill(...STALK_LEAF_COLORS.outer);
		this.sk.noStroke();
		this.drawLeafShape(scale, 0, 25, 3);

		// Inner leaf highlight
		this.sk.fill(...STALK_LEAF_COLORS.inner);
		this.drawLeafShape(scale, 2, 20, 1.5);

		// Veins
		this.sk.stroke(...STALK_LEAF_COLORS.vein);
		this.sk.strokeWeight(scale * 0.4);
		this.sk.noFill();
		this.sk.line(scale, 0, scale * 22, 0);

		this.sk.strokeWeight(scale * 0.2);
		for (let i = 1; i <= 4; i++) {
			const vx = scale * (4 + i * 4);
			this.sk.line(vx, 0, vx + scale * 3, -scale * 1.5);
			this.sk.line(vx, 0, vx + scale * 3, scale * 1.5);
		}

		this.sk.pop();
	}

	drawLeafShape(scale, startX, endX, curveHeight) {
		const midX = (startX + endX) / 2 + 3;
		this.sk.beginShape();
		this.sk.vertex(scale * startX, 0);
		this.sk.bezierVertex(
			scale * midX, -scale * curveHeight,
			scale * (endX - 7), -scale * (curveHeight * 0.67),
			scale * endX, 0
		);
		this.sk.bezierVertex(
			scale * (endX - 7), scale * (curveHeight * 0.67),
			scale * midX, scale * curveHeight,
			scale * startX, 0
		);
		this.sk.endShape(this.sk.CLOSE);
	}

	drawPetals(scaleFactor, color) {
		const baseR = this.sk.red(color);
		const baseG = this.sk.green(color);
		const baseB = this.sk.blue(color);

		const petalLength = scaleFactor * 52;
		const petalWidth = scaleFactor * 18;
		const centerRadius = scaleFactor * 11;

		for (let i = 0; i < NUM_PETALS; i++) {
			const angleVariation = Math.sin(i * 2.3) * 0.08;
			const angle = (this.sk.TWO_PI / NUM_PETALS) * i + angleVariation;

			const sizeVariation = 0.82 + Math.sin(i * 1.7 + 0.5) * 0.18;
			const widthVariation = 0.9 + Math.cos(i * 2.1) * 0.15;

			this.sk.push();
			this.sk.rotate(angle);

			// Draw gradient layers from outside in
			for (let g = 0; g < GRADIENT_STEPS; g++) {
				const t = g / (GRADIENT_STEPS - 1);
				const layerScale = 1 - t * 0.55;

				const r = Math.min(255, baseR + (1 - t) * 55 + Math.sin(i) * 10);
				const gColor = Math.min(255, baseG + (1 - t) * 50);
				const b = Math.min(255, baseB + (1 - t) * 45);

				this.sk.fill(r, gColor, b, 90 + t * 110);
				this.sk.noStroke();
				this.drawOrganicPetal(
					centerRadius * 0.9,
					petalLength * layerScale * sizeVariation,
					petalWidth * layerScale * widthVariation,
					i
				);
			}

			// Subtle vein line on larger flowers
			if (scaleFactor > 0.4) {
				this.sk.stroke(baseR - 30, baseG - 30, baseB - 30, 40);
				this.sk.strokeWeight(0.5);
				this.sk.line(0, centerRadius, 0, centerRadius + petalLength * sizeVariation * 0.7);
			}

			this.sk.pop();
		}

		// Organic center with texture
		this.drawFlowerCenter(centerRadius, baseR, baseG, baseB, scaleFactor);
	}

	drawOrganicPetal(startDist, length, width, index) {
		// Each petal slightly different shape based on index
		const asymmetry = Math.sin(index * 1.3) * 0.15;
		const tipOffset = Math.cos(index * 0.9) * width * 0.1;

		this.sk.beginShape();

		this.sk.vertex(0, startDist);

		// Left curve - slightly asymmetric
		this.sk.bezierVertex(
			-width * (0.65 + asymmetry), startDist + length * 0.18,
			-width * (0.75 + asymmetry * 0.5), startDist + length * 0.65,
			tipOffset, startDist + length
		);

		// Right curve - mirror with slight variation
		this.sk.bezierVertex(
			width * (0.75 - asymmetry * 0.5), startDist + length * 0.65,
			width * (0.65 - asymmetry), startDist + length * 0.18,
			0, startDist
		);

		this.sk.endShape(this.sk.CLOSE);
	}

	drawFlowerCenter(radius, baseR, baseG, baseB, scaleFactor) {
		// Outer ring (darker)
		this.sk.fill(baseR - 50, baseG - 50, baseB - 50, 255);
		this.sk.noStroke();
		this.sk.circle(0, 0, radius * 2);

		// Middle gradient rings
		for (let r = radius * 0.85; r > radius * 0.3; r -= radius * 0.15) {
			const t = 1 - r / radius;
			this.sk.fill(
				baseR - 40 + t * 50,
				baseG - 40 + t * 50,
				baseB - 40 + t * 50,
				220
			);
			this.sk.circle(0, 0, r * 2);
		}

		// Tiny dots/texture in center for realism
		if (scaleFactor > 0.35) {
			const numDots = Math.floor(8 + scaleFactor * 5);
			for (let i = 0; i < numDots; i++) {
				const dotAngle = (this.sk.TWO_PI / numDots) * i + 0.3;
				const dotDist = radius * (0.3 + Math.sin(i * 1.5) * 0.15);
				const dx = Math.cos(dotAngle) * dotDist;
				const dy = Math.sin(dotAngle) * dotDist;

				this.sk.fill(baseR - 60, baseG - 60, baseB - 60, 150);
				this.sk.circle(dx, dy, scaleFactor * 1.5);
			}
		}

		// Highlight spot
		this.sk.fill(255, 255, 255, 35);
		this.sk.circle(-radius * 0.25, -radius * 0.25, radius * 0.5);
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

	drawSpeakerTooltip(speaker, numOfTurns, numOfWords, turnArray, speakerColor) {
		// Get first words from each turn
		const firstWords = new Set();
		const wordsToDisplay = [];

		turnArray.forEach((element) => {
			if (!firstWords.has(element.turnNumber)) {
				firstWords.add(element.turnNumber);
				this.localArrayOfFirstWords.push(element);
				wordsToDisplay.push(element.word);
			}
		});

		const transcript = get(TranscriptStore);
		const totalWords = transcript.totalNumOfWords;
		const totalTurns = transcript.totalConversationTurns;
		const wordPercent = totalWords > 0 ? Math.round((numOfWords / totalWords) * 100) : 0;
		const turnPercent = totalTurns > 0 ? Math.round((numOfTurns / totalTurns) * 100) : 0;

		// Build tooltip content
		const firstWordsLine = wordsToDisplay.join(' ');
		const statsLine = `${numOfWords} words (${wordPercent}%)\n${numOfTurns} turns (${turnPercent}%)`;
		const tooltipContent = `<b>First words per turn:</b>\n${firstWordsLine}\n\n${statsLine}`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, tooltipContent, speakerColor, this.sk.height);
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
