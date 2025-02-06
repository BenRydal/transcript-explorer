export class DrawUtils {
	constructor(sk) {
		this.sk = sk;
		this.scaleFactor = 1.3;
	}

	drawTextBox(stringTurn, speakerColor) {
		const textBox = this.calculateTextBoxDimensions(this.getTextBoxParams(), stringTurn);
		this.calculateFontSizeForText(stringTurn, textBox);

		// Draw the box with padding
		this.sk.stroke(0);
		this.sk.strokeWeight(1);
		this.sk.fill(255, 200);
		this.sk.rect(
			textBox.xPos - textBox.boxSpacing,
			textBox.adjustYPos - textBox.boxSpacing,
			textBox.width + 2 * textBox.boxSpacing,
			textBox.height + 2 * textBox.boxSpacing
		);

		// Draw the text inside the box
		this.sk.fill(speakerColor);
		this.sk.noStroke();
		this.sk.text(stringTurn, textBox.xPos, textBox.adjustYPos + this.sk.toolTipTextSize, textBox.width, textBox.height);

		// Draw cartoon bubble lines
		this.drawCartoonBubbleLines(textBox);
	}

	/**
	 * Draws cartoon bubble lines from the mouse position to the textbox
	 */
	drawCartoonBubbleLines(textBox) {
		this.sk.stroke(255);
		this.sk.strokeWeight(2);
		this.sk.line(
			this.sk.mouseX - textBox.rectSpacing,
			textBox.adjustYPos + textBox.yDif,
			this.sk.mouseX - textBox.rectSpacing / 2,
			textBox.adjustYPos + textBox.yDif
		);

		this.sk.stroke(0);
		this.sk.strokeWeight(1);
		this.sk.line(this.sk.mouseX, this.sk.mouseY, this.sk.mouseX - textBox.rectSpacing, textBox.adjustYPos + textBox.yDif);
		this.sk.line(this.sk.mouseX, this.sk.mouseY, this.sk.mouseX - textBox.rectSpacing / 2, textBox.adjustYPos + textBox.yDif);
	}

	getTextBoxParams() {
		const widthScale = this.sk.width / 3;
		const heightScale = this.sk.height / 4;

		return {
			width: widthScale,
			height: heightScale,
			textLeading: this.sk.height / 30,
			boxSpacing: 20,
			rectSpacing: 50
		};
	}

	calculateTextBoxDimensions(textBox, talkTurn) {
		const lines = Math.ceil(this.sk.textWidth(talkTurn) / textBox.width);
		textBox.height = textBox.textLeading * lines * this.scaleFactor; // Calculate the height based on lines and leading
		textBox.height = Math.min(textBox.height, this.sk.height / 2); // limit height
		textBox.xPos = this.sk.constrain(this.sk.mouseX - textBox.width / 2, textBox.boxSpacing, this.sk.width - textBox.width - 2 * textBox.boxSpacing);

		if (this.sk.mouseY < this.sk.height / 4) {
			textBox.adjustYPos = this.sk.mouseY + textBox.rectSpacing;
			textBox.yDif = -textBox.boxSpacing;
		} else {
			textBox.adjustYPos = this.sk.mouseY - textBox.rectSpacing - textBox.height;
			textBox.yDif = textBox.height + textBox.boxSpacing;
		}
		return textBox;
	}

	calculateFontSizeForText(text, textBox) {
		let fontSize = this.sk.toolTipTextSize; // Start with the default font size
		while (Math.ceil(this.sk.textWidth(text) / textBox.width) * fontSize * this.scaleFactor > textBox.height) {
			console.log(this.sk.textWidth(text));
			fontSize--;
			this.sk.textSize(fontSize);
			if (fontSize <= 8) break; // Prevent infinite loop
		}
	}
}
