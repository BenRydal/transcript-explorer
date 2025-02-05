import P5Store from '../../stores/p5Store';
import TranscriptStore from '../../stores/transcriptStore.js';
import UserStore from '../../stores/userStore';
import type { User } from '../../models/user';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import { initialConfig } from '../../stores/configStore';
import { VideoController, Draw, DynamicData } from '..';

let users: User[] = [];
let timeline, transcript, currConfig;
TimelineStore.subscribe((data) => {
	timeline = data;
});

UserStore.subscribe((data) => {
	users = data;
});

ConfigStore.subscribe((data) => {
	currConfig = data;
});

TranscriptStore.subscribe((data) => {
	transcript = data;
});

export const igsSketch = (p5: any) => {
	P5Store.set(p5);

	p5.preload = () => {
		p5.font = p5.loadFont('/fonts/PlusJakartaSans/VariableFont_wght.ttf');
	};

	p5.setup = () => {
		const bottomNavHeight = (document.querySelector('.btm-nav') as HTMLElement).offsetHeight;
		p5.createCanvas(window.innerWidth, window.innerHeight - bottomNavHeight);
		p5.dynamicData = new DynamicData(p5);
		p5.videoController = new VideoController(p5);
		p5.SPACING = 25;
		p5.toolTipTextSize = 30;
		p5.textFont(p5.font);
		p5.animationCounter = 0; // controls animation of data
	};

	p5.draw = () => {
		if (p5.arrayIsLoaded(transcript.wordArray) && p5.arrayIsLoaded(users)) {
			p5.background(255);
			const render = new Draw(p5);
			render.drawViz();
		}
		if (timeline.getIsAnimating()) p5.updateAnimation();
	};

	p5.updateAnimation = () => {
		const mappedTime = Math.ceil(p5.map(timeline.getCurrTime(), 0, timeline.getEndTime(), 0, transcript.totalNumOfWords));
		p5.syncAnimationCounter(mappedTime);
		p5.handleTimelineAnimationState();
	};

	// Synchronize animationCounter with mappedTime
	p5.syncAnimationCounter = (mappedTime) => {
		if (p5.animationCounter < mappedTime) {
			p5.scrubForward(mappedTime);
		} else if (p5.animationCounter > mappedTime) {
			p5.scrubBackward(mappedTime);
		}
	};

	p5.scrubForward = (mappedTime) => {
		for (let i = p5.animationCounter; i < mappedTime; i++) {
			p5.dynamicData.update(transcript.wordArray[p5.animationCounter]);
			p5.animationCounter++;
		}
	};

	p5.scrubBackward = (mappedTime) => {
		for (let i = p5.animationCounter; i > mappedTime; i--) {
			p5.dynamicData.removeLastElement();
			p5.animationCounter--;
		}
	};

	// Handle continuation or end of animation
	p5.handleTimelineAnimationState = () => {
		if (timeline.getCurrTime() < timeline.getEndTime()) {
			p5.continueTimelineAnimation();
		} else {
			p5.endTimelineAnimation();
		}
	};

	p5.continueTimelineAnimation = () => {
		let timeToSet = 0;
		if (p5.videoController.isLoadedAndIsPlaying()) {
			timeToSet = p5.videoController.getVideoPlayerCurTime();
		} else {
			timeToSet = timeline.getCurrTime() + currConfig.animationRate;
		}
		TimelineStore.update((timeline) => {
			timeline.setCurrTime(timeToSet);
			return timeline;
		});
	};

	p5.endTimelineAnimation = () => {
		TimelineStore.update((timeline) => {
			timeline.setIsAnimating(false);
			return timeline;
		});
	};

	p5.mouseMoved = () => {
		p5.loop();
	};

	p5.mousePressed = () => {
		if (p5.videoController.isLoaded && p5.videoController.isShowing) {
			if (p5.videoController.isPlaying) {
				p5.videoController.pause();
			} else if (currConfig.distributionDiagramToggle && currConfig.arrayOfFirstWords.length) {
				p5.videoController.playForDistributionDiagram(currConfig.arrayOfFirstWords);
			} else if (currConfig.turnChartToggle) {
				p5.videoController.playForTurnChart(p5.getTimeValueFromPixel(p5.mouseX));
			} else if (currConfig.contributionCloudToggle && !currConfig.selectedWordFromContributionCloud) {
				p5.videoController.playForContributionCloud(p5.videoController.jumpTime);
			} else {
				if (currConfig.arrayOfFirstWords.length) {
					p5.videoController.playForDistributionDiagram(currConfig.arrayOfFirstWords);
				} else if (!currConfig.selectedWordFromContributionCloud) {
					p5.videoController.playForContributionCloud(p5.videoController.jumpTime);
				} else {
					p5.videoController.playForTurnChart(p5.getTimeValueFromPixel(p5.mouseX));
				}
			}
		}
	};

	p5.resetAnimation = () => {
		p5.resetScalingVars();
		p5.dynamicData.clear();
		p5.animationCounter = 0;
	};

	p5.fillAllData = () => {
		p5.animationCounter = transcript.wordArray.length;
		p5.fillSelectedData();
	};

	p5.fillSelectedData = () => {
		p5.resetScalingVars();
		p5.dynamicData.clear();
		for (let i = 0; i < p5.animationCounter; i++) {
			p5.dynamicData.update(transcript.wordArray[i]);
		}
	};

	p5.resetScalingVars = () => {
		ConfigStore.update((currConfig) => ({
			...currConfig,
			scalingVars: { ...initialConfig.scalingVars } // Reset to initial values
		}));
	};

	p5.updateScalingVars = (scaleFactor = 0.9) => {
		ConfigStore.update((currConfig) => ({
			...currConfig,
			scalingVars: {
				minTextSize: currConfig.scalingVars.minTextSize * scaleFactor,
				maxTextSize: currConfig.scalingVars.maxTextSize * scaleFactor,
				spacing: currConfig.scalingVars.spacing * scaleFactor,
				newSpeakerSpacing: currConfig.scalingVars.newSpeakerSpacing * scaleFactor
			}
		}));
	};

	/**
	 * Determines whether to draw an item/word object based on specified properties and conditions.
	 * Used to highlight data in the dashboard view.
	 * @param {Object} item - The word/item to be checked for drawing.
	 * @param {string} comparisonProperty - The property of the word to compare (e.g., 'turnNumber').
	 * @param {string} selectedProperty - The property name in this object for comparison (e.g., 'firstWordOfTurnSelectedInTurnChart').
	 * @returns {boolean} - True if the item should be drawn, false otherwise.
	 */
	p5.shouldDraw = (item: any, comparisonProperty: string, selectedProperty: string) => {
		// Retrieve the comparison object from this object's property.
		const comparisonObject = currConfig[selectedProperty];

		// Determine if there are any first words to consider for comparison.
		const hasFirstWords = currConfig.arrayOfFirstWords && currConfig.arrayOfFirstWords.length > 0;

		// Check if the item's property matches the corresponding property in the comparison object.
		const matchesComparisonProperty = comparisonObject ? item[comparisonProperty] === comparisonObject[comparisonProperty] : true;

		// Check if the item's speaker matches the speaker of the first word, if applicable.
		const matchesFirstSpeaker = hasFirstWords ? item.speaker === currConfig.arrayOfFirstWords[0].speaker : true;

		// The item should be drawn if it matches both the comparison property and the first speaker.
		return matchesComparisonProperty && matchesFirstSpeaker;
	};

	p5.getTimeValueFromPixel = (pixelValue: number) => {
		return Math.floor(p5.map(pixelValue, p5.SPACING, p5.width - p5.SPACING, timeline.getLeftMarker(), timeline.getRightMarker()));
	};

	p5.overRect = (x: number, y: number, boxWidth: number, boxHeight: number) => {
		return p5.mouseX >= x && p5.mouseX <= x + boxWidth && p5.mouseY >= y && p5.mouseY <= y + boxHeight;
	};

	p5.windowResized = () => {
		const bottomNavHeight = (document.querySelector('.btm-nav') as HTMLElement).offsetHeight;
		p5.resizeCanvas(window.innerWidth, window.innerHeight - bottomNavHeight);
		// p5.GUITEXTSIZE = p5.width / 70;
		// p5.textSize(p5.GUITEXTSIZE);
		p5.loop();
	};

	p5.overCircle = (x: number, y: number, diameter: number) => {
		return p5.sqrt(p5.sq(x - p5.mouseX) + p5.sq(y - p5.mouseY)) < diameter / 2;
	};

	p5.arrayIsLoaded = (data: any) => {
		return Array.isArray(data) && data.length;
	};
};
