import TimelineStore from '../../stores/timelineStore';
import TranscriptStore from '../../stores/transcriptStore';
import { get } from 'svelte/store';

export class SketchController {
	constructor(sketch) {
		this.sk = sketch;
		this.scalingVars = this.createScalingVars(); // holds values that influence how contribution cloud is drawn

		// ADDITIONAL PROGRAM CONTROL DATA
		this.selectedWordFromContributionCloud = undefined;
		this.firstWordOfTurnSelectedInTurnChart = undefined;
		this.arrayOfFirstWords = []; // holds first words of turns for distribution diagram
	}

	/**
	 * Reset all vars controlling animation
	 */
	resetAnimation() {
		this.scalingVars = this.createScalingVars();
		this.sk.dynamicData.clear();
		this.sk.animationCounter = 0;
	}

	/**
	 * Refills dynamicWordArray with all data
	 */
	fillAllData() {
		const transcript = get(TranscriptStore);
		this.sk.animationCounter = transcript.wordArray.length;
		this.fillSelectedData();
	}

	/**
	 * Resets dynamicWordArray and vars controlling data representation and animation
	 * Refills dynamicWordArray based on what data is selected
	 */
	fillSelectedData() {
		const transcript = get(TranscriptStore);
		this.scalingVars = this.createScalingVars();
		this.sk.dynamicData.clear();
		for (let i = 0; i < this.sk.animationCounter; i++) {
			this.sk.dynamicData.update(transcript.wordArray[i]);
		}
	}

	resetForNewData() {
		this.sk.core.clearAll();
		this.resetAnimation();
	}

	// ***** TODO: Below are methods to consider refactoring ***** //

	getPixelValueFromTime(timeValue) {
		const timeline = get(TimelineStore);
		return this.sk.map(timeValue, timeline.getLeftMarker(), timeline.getRightMarker(), this.sk.SPACING, this.sk.width - this.sk.SPACING);
	}

	createScalingVars() {
		return {
			minTextSize: 20,
			maxTextSize: 50,
			spacing: 50,
			newSpeakerSpacing: 75
		};
	}

	updateScalingVars() {
		const scaleFactor = 0.9;
		this.scalingVars.minTextSize *= scaleFactor;
		this.scalingVars.maxTextSize *= scaleFactor;
		this.scalingVars.spacing *= scaleFactor;
		this.scalingVars.newSpeakerSpacing *= scaleFactor;
	}

	/**
	 * Determines whether to draw an item/word object based on specified properties and conditions.
	 * Important to highlight data in the dashboard view.
	 * @param {Object} item - The word/item to be checked for drawing.
	 * @param {string} comparisonProperty - The property of the word to compare (e.g., 'turnNumber').
	 * @param {string} selectedProperty - The property name in this object for comparison (e.g., 'firstWordOfTurnSelectedInTurnChart').
	 * @returns {boolean} - True if the item should be drawn, false otherwise.
	 */
	shouldDraw(item, comparisonProperty, selectedProperty) {
		// Retrieve the comparison object from this object's property.
		const comparisonObject = this[selectedProperty];

		// Determine if there are any first words to consider for comparison.
		const hasFirstWords = this.arrayOfFirstWords && this.arrayOfFirstWords.length > 0;

		// Check if the item's property matches the corresponding property in the comparison object.
		const matchesComparisonProperty = comparisonObject ? item[comparisonProperty] === comparisonObject[comparisonProperty] : true;

		// Check if the item's speaker matches the speaker of the first word, if applicable.
		const matchesFirstSpeaker = hasFirstWords ? item.speaker === this.arrayOfFirstWords[0].speaker : true;

		// The item should be drawn if it matches both the comparison property and the first speaker.
		return matchesComparisonProperty && matchesFirstSpeaker;
	}
}
