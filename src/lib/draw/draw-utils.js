export class drawUtils {
	constructor(sk) {
		this.sk = sk;
	}

	/**
	 * Draws textbox and cartoon "bubble" for user selected conversation
	 * Sets box dimensions based on size of conversation turn/text
	 */
	drawTextBox(stringTurn, speakerColor) {
		const textBox = this.addTextBoxParams(this.getTextBoxParams(), stringTurn);
		this.sk.stroke(0);
		this.sk.strokeWeight(1);
		this.sk.fill(255, 200);
		this.sk.rect(
			textBox.xPos - textBox.boxSpacing,
			textBox.adjustYPos - textBox.boxSpacing,
			textBox.width + 2 * textBox.boxSpacing,
			textBox.height + 2 * textBox.boxSpacing
		);
		// Draw Text
		this.sk.fill(speakerColor);
		this.sk.noStroke();
		this.sk.text(stringTurn, textBox.xPos, textBox.adjustYPos + this.sk.toolTipTextSize, textBox.width, textBox.height);
		// Cartoon bubble lines
		this.sk.stroke(255);
		this.sk.strokeWeight(2);
		this.sk.line(
			this.sk.mouseX - textBox.rectSpacing,
			textBox.adjustYPos + textBox.yDif,
			this.sk.mouseX - textBox.rectSpacing / 2,
			textBox.adjustYPos + textBox.yDif
		); // white line to hide black rect under cartoon bubble
		this.sk.stroke(0);
		this.sk.strokeWeight(1);
		this.sk.line(this.sk.mouseX, this.sk.mouseY, this.sk.mouseX - textBox.rectSpacing, textBox.adjustYPos + textBox.yDif);
		this.sk.line(this.sk.mouseX, this.sk.mouseY, this.sk.mouseX - textBox.rectSpacing / 2, textBox.adjustYPos + textBox.yDif);
	}

	getTextBoxParams() {
		return {
			width: this.sk.width / 3,
			textLeading: this.sk.width / 57,
			boxSpacing: this.sk.width / 141, // general textBox spacing variable
			rectSpacing: this.sk.width / 28.2 // distance from text rectangle of textbox
		};
	}

	addTextBoxParams(textBox, talkTurn) {
		textBox.height = textBox.textLeading * Math.ceil(this.sk.textWidth(talkTurn) / textBox.width) * 1.3;
		textBox.xPos = this.sk.constrain(this.sk.mouseX - textBox.width / 2, textBox.boxSpacing, this.sk.width - textBox.width - 2 * textBox.boxSpacing);
		if (this.sk.mouseY < this.sk.height / 5) {
			//if top half of screen, text box below rectangle
			textBox.adjustYPos = this.sk.mouseY + textBox.rectSpacing;
			textBox.yDif = -textBox.boxSpacing;
		} else {
			//if bottom half of screen, text box above rectangle
			textBox.adjustYPos = this.sk.mouseY - textBox.rectSpacing - textBox.height;
			textBox.yDif = textBox.height + textBox.boxSpacing;
		}
		return textBox;
	}
}
