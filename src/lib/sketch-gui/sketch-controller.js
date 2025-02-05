import TimelineStore from '../../stores/timelineStore';
import TranscriptStore from '../../stores/transcriptStore';
import ConfigStore from '../../stores/configStore';
import { get } from 'svelte/store';

export class SketchController {
	constructor(sketch) {
		this.sk = sketch;
		this.scalingVars = this.createScalingVars(); // holds values that influence how contribution cloud is drawn
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

	// ***** TODO: Refactor below methods ***** //

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
}
