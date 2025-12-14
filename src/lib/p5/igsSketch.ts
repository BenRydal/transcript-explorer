import P5Store from '../../stores/p5Store';
import TranscriptStore from '../../stores/transcriptStore.js';
import UserStore from '../../stores/userStore';
import type { User } from '../../models/user';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import VideoStore, { play as videoPlay, pause as videoPause, requestSeek } from '../../stores/videoStore';
import type { VideoState } from '../../stores/videoStore';
import { Draw, DynamicData } from '..';
import { clearScalingCache } from '../draw/contribution-cloud';

let users: User[] = [];
let timeline, transcript, currConfig;
let videoState: VideoState;

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

VideoStore.subscribe((data) => {
	videoState = data;
});

export const igsSketch = (p5: any) => {
	P5Store.set(p5);

	p5.preload = () => {
		p5.font = p5.loadFont('/fonts/PlusJakartaSans/VariableFont_wght.ttf');
	};

	p5.setup = () => {
		const { width, height } = p5.getContainerSize();
		p5.createCanvas(width, height);
		p5.dynamicData = new DynamicData(p5);
		p5.SPACING = 25;
		p5.toolTipTextSize = 30;
		p5.textFont(p5.font);
		p5.animationCounter = 0; // controls animation of data
	};

	p5.getContainerSize = () => {
		const container = document.getElementById('p5-container');
		if (container) {
			const rect = container.getBoundingClientRect();
			return { width: rect.width, height: rect.height };
		}
		// Fallback to window-based calculation
		const bottomNavHeight = (document.querySelector('.btm-nav') as HTMLElement)?.offsetHeight || 80;
		return { width: window.innerWidth, height: window.innerHeight - bottomNavHeight };
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

	p5.syncAnimationCounter = () => {
		// Find the index of the first word that starts after the current time
		let targetIndex = p5.getAnimationTargetIndex();
		// Calculate the delta between the current animation counter and the target index
		const delta = Math.abs(targetIndex - p5.animationCounter);
		const fastCatchUpThreshold = 100; // for catching up when user scrubs forward or backward

		if (delta > fastCatchUpThreshold) {
			p5.setAnimationCounter(targetIndex);
		} else {
			const maxStepsPerFrame = 1;
			let steps = 0;

			while (p5.animationCounter < targetIndex && steps < maxStepsPerFrame && p5.animationCounter < transcript.wordArray.length) {
				p5.dynamicData.update(transcript.wordArray[p5.animationCounter]);
				p5.animationCounter++;
				steps++;
			}

			while (p5.animationCounter > targetIndex && steps < maxStepsPerFrame && p5.animationCounter > 0) {
				p5.dynamicData.removeLastElement();
				p5.animationCounter--;
				steps++;
			}
		}
	};

	p5.getAnimationTargetIndex = () => {
		const currTime = timeline.getCurrTime();
		let targetIndex = transcript.wordArray.findIndex((word) => word.startTime > currTime);
		if (targetIndex < 0) targetIndex = transcript.wordArray.length;
		return targetIndex;
	};

	p5.setAnimationCounter = (targetIndex: number) => {
		p5.animationCounter = targetIndex;
		p5.fillSelectedData();
	};

	p5.handleTimelineAnimationState = () => {
		if (timeline.getCurrTime() < timeline.getRightMarker()) {
			p5.continueTimelineAnimation();
		} else {
			p5.endTimelineAnimation();
		}
	};

	p5.continueTimelineAnimation = () => {
		let timeToSet = 0;
		if (videoState.isLoaded && videoState.isPlaying) {
			// Get time from video via VideoStore's currentTime
			timeToSet = videoState.currentTime;
		} else {
			timeToSet = timeline.getCurrTime() + currConfig.animationRate;
		}
		TimelineStore.update((timeline) => {
			timeline.setCurrTime(timeToSet);
			return timeline;
		});
	};

	p5.endTimelineAnimation = () => {
		p5.setAnimationCounter(p5.getAnimationTargetIndex()); // important if user scrubs to end quickly
		TimelineStore.update((timeline) => {
			timeline.setIsAnimating(false);
			// Reset to left marker when animation completes
			timeline.setCurrTime(timeline.getLeftMarker());
			return timeline;
		});
		p5.fillSelectedData(); // Update visualization to reflect reset position
	};

	p5.mousePressed = () => {
		// Video interaction is now handled by VideoContainer.svelte
		// This mousePressed only handles canvas interactions when video is not over the click
		if (!videoState.isLoaded || !videoState.isVisible) return;

		if (videoState.isPlaying) {
			videoPause();
		} else if (p5.overRect(0, 0, p5.width, p5.height)) {
			p5.handleVideoPlay();
		}
	};

	p5.handleVideoPlay = () => {
		const { distributionDiagramToggle, turnChartToggle, contributionCloudToggle, arrayOfFirstWords, selectedWordFromContributionCloud, firstWordOfTurnSelectedInTurnChart } = currConfig;

		let seekTime: number | null = null;

		if (distributionDiagramToggle) {
			if (arrayOfFirstWords.length) {
				// Play first 2 seconds of each turn (simplified - just seek to first)
				seekTime = arrayOfFirstWords[0]?.startTime;
			}
		} else if (turnChartToggle) {
			seekTime = p5.getTimeValueFromPixel(p5.mouseX);
		} else if (contributionCloudToggle) {
			if (selectedWordFromContributionCloud) {
				seekTime = selectedWordFromContributionCloud.startTime;
			}
		} else {
			// Dashboard mode - use most relevant selection
			if (arrayOfFirstWords.length) {
				seekTime = arrayOfFirstWords[0]?.startTime;
			} else if (selectedWordFromContributionCloud) {
				seekTime = selectedWordFromContributionCloud.startTime;
			} else {
				seekTime = p5.getTimeValueFromPixel(p5.mouseX);
			}
		}

		if (seekTime !== null) {
			requestSeek(seekTime);
			videoPlay();
		}
	};

	p5.playTurnSnippets = async (turns: any[]) => {
		if (isPlayingTurnSnippets) return;
		isPlayingTurnSnippets = true;

		for (const turn of turns) {
			if (!isPlayingTurnSnippets) break;
			requestSeek(turn.startTime);
			videoPlay();
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		videoPause();
		isPlayingTurnSnippets = false;
	};

	p5.stopTurnSnippets = () => {
		isPlayingTurnSnippets = false;
	};

	p5.resetAnimation = () => {
		p5.dynamicData.clear();
		p5.animationCounter = 0;
	};

	p5.fillAllData = () => {
		p5.animationCounter = transcript.wordArray.length;
		p5.fillSelectedData();
	};

	p5.fillSelectedData = () => {
		if (!p5.dynamicData) return; // Guard against calls before setup completes
		clearScalingCache(); // Clear contribution cloud scaling cache when data changes
		p5.dynamicData.clear();
		for (let i = 0; i < p5.animationCounter; i++) {
			p5.dynamicData.update(transcript.wordArray[i]);
		}
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
		// Retrieve the comparison object safely
		const comparisonObject = currConfig[selectedProperty] ?? {};

		// Ensure first words array is defined and has at least one element
		const hasFirstWords = Array.isArray(currConfig.arrayOfFirstWords) && currConfig.arrayOfFirstWords.length > 0;

		// Safely check if the item's property matches the comparison object's property
		const matchesComparisonProperty =
			comparisonObject && comparisonProperty in comparisonObject ? item[comparisonProperty] === comparisonObject[comparisonProperty] : true;

		// Safely check if the item's speaker matches the first word's speaker
		const matchesFirstSpeaker =
			hasFirstWords && currConfig.arrayOfFirstWords[0]?.speaker ? item.speaker === currConfig.arrayOfFirstWords[0].speaker : true;

		return matchesComparisonProperty && matchesFirstSpeaker;
	};

	p5.getTimeValueFromPixel = (pixelValue: number) => {
		return Math.floor(p5.map(pixelValue, p5.SPACING, p5.width - p5.SPACING, timeline.getLeftMarker(), timeline.getRightMarker()));
	};

	p5.overRect = (x: number, y: number, boxWidth: number, boxHeight: number) => {
		return p5.mouseX >= x && p5.mouseX <= x + boxWidth && p5.mouseY >= y && p5.mouseY <= y + boxHeight;
	};

	p5.windowResized = () => {
		if (!p5.dynamicData) return; // Guard against calls before setup completes
		const { width, height } = p5.getContainerSize();
		p5.resizeCanvas(width, height);
		p5.fillSelectedData();
	};

	p5.overCircle = (x: number, y: number, diameter: number) => {
		return p5.sqrt(p5.sq(x - p5.mouseX) + p5.sq(y - p5.mouseY)) < diameter / 2;
	};

	p5.arrayIsLoaded = (data: any) => {
		return Array.isArray(data) && data.length;
	};
};
