import P5Store from '../../stores/p5Store';
import TranscriptStore from '../../stores/transcriptStore.js';
import UserStore from '../../stores/userStore';
import type { User } from '../../models/user';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import EditorStore from '../../stores/editorStore';
import VideoStore, { play as videoPlay, pause as videoPause, requestSeek } from '../../stores/videoStore';
import type { VideoState } from '../../stores/videoStore';
import { Draw } from '../draw/draw';
import { DynamicData } from '../core/dynamic-data';

let users: User[] = [];
let timeline, transcript, currConfig, editorState;
let videoState: VideoState;
let isPlayingTurnSnippets = false;
let canHover = true;
let mouseEventLocked = false;

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

EditorStore.subscribe((data) => {
	editorState = data;
});

export const igsSketch = (p5: any) => {
	P5Store.set(p5);

	p5.preload = () => {
		p5.font = p5.loadFont('/fonts/PlusJakartaSans/VariableFont_wght.ttf');
	};

	p5.setup = () => {
		const { width, height } = p5.getContainerSize();
		p5.createCanvas(width, height);
		p5.dynamicData = new DynamicData();
		p5.renderer = new Draw(p5);
		p5.SPACING = 25;
		p5.toolTipTextSize = 30;
		p5.textFont(p5.font);
		p5.animationCounter = 0; // controls animation of data

		// Track if mouse is over canvas (not blocked by UI elements)
		const canvas = document.querySelector('#p5-container canvas');
		document.addEventListener('pointermove', (e) => {
			canHover = e.target === canvas;
		});

		// If transcript data already exists (e.g., after mode switch), populate it
		if (transcript.wordArray?.length > 0) {
			p5.fillAllData();
		}
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
			p5.renderer.drawViz();
		}
		if (timeline.isAnimating) p5.updateAnimation();
	};

	p5.updateAnimation = () => {
		p5.syncAnimationCounter();
		p5.handleTimelineAnimationState();
	};

	p5.syncAnimationCounter = () => {
		const targetIndex = p5.getAnimationTargetIndex();
		const delta = targetIndex - p5.animationCounter;
		if (delta === 0) return;

		const skipAnimationThreshold = 100;
		if (Math.abs(delta) > skipAnimationThreshold) {
			p5.animationCounter = targetIndex;
		} else {
			p5.animationCounter += Math.sign(delta);
		}
		p5.dynamicData.setEndIndex(p5.animationCounter);
	};

	p5.getAnimationTargetIndex = () => {
		const currTime = timeline.currTime;
		const words = transcript.wordArray;
		let low = 0;
		let high = words.length;

		// Binary search: find first index where startTime > currTime
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (words[mid].startTime <= currTime) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	};

	p5.setAnimationCounter = (targetIndex: number) => {
		p5.animationCounter = targetIndex;
		p5.dynamicData.setEndIndex(targetIndex);
	};

	p5.handleTimelineAnimationState = () => {
		if (timeline.currTime < timeline.rightMarker) {
			p5.continueTimelineAnimation();
		} else {
			p5.endTimelineAnimation();
		}
	};

	p5.continueTimelineAnimation = () => {
		const timeToSet = videoState.isLoaded && videoState.isPlaying
			? videoState.currentTime
			: timeline.currTime + (currConfig.animationRate * Math.min(p5.deltaTime, 100)) / 1000;

		TimelineStore.update((t) => {
			t.currTime = timeToSet;
			return t;
		});
	};

	p5.endTimelineAnimation = () => {
		p5.setAnimationCounter(p5.getAnimationTargetIndex()); // important if user scrubs to end quickly
		TimelineStore.update((timeline) => {
			timeline.isAnimating = false;
			// Reset to left marker when animation completes
			timeline.currTime = timeline.leftMarker;
			return timeline;
		});
		p5.fillSelectedData(); // Update visualization to reflect reset position
	};

	p5.mousePressed = () => {
		if (mouseEventLocked) return;
		mouseEventLocked = true;
		requestAnimationFrame(() => {
			mouseEventLocked = false;
		});

		p5.handleSpeakerFilterClick();
		p5.handleVideoClick();
	};

	// Lock speaker filter in editor when clicking on a speaker's visualization
	p5.handleSpeakerFilterClick = () => {
		if (!editorState?.config?.isVisible) return;

		const hoveredSpeaker = currConfig.hoveredSpeakerInDistributionDiagram;
		if (hoveredSpeaker) {
			EditorStore.update((state) => ({
				...state,
				selection: {
					...state.selection,
					filteredSpeaker: hoveredSpeaker,
					highlightedSpeaker: hoveredSpeaker,
					selectedTurnNumber: null,
					selectionSource: 'distributionDiagramClick'
				}
			}));
		}
	};

	// Handle video play/pause when clicking on canvas
	p5.handleVideoClick = () => {
		if (!videoState.isLoaded || !videoState.isVisible) return;
		if (!p5.overRect(0, 0, p5.width, p5.height)) return;

		// If playing, pause
		if (videoState.isPlaying || isPlayingTurnSnippets) {
			p5.stopTurnSnippets();
			videoPause();
			return;
		}

		// Play from whatever is currently hovered
		const { firstWordOfTurnSelectedInTurnChart, selectedWordFromContributionCloud, arrayOfFirstWords } = currConfig;

		if (firstWordOfTurnSelectedInTurnChart) {
			requestSeek(firstWordOfTurnSelectedInTurnChart.startTime);
			videoPlay();
		} else if (selectedWordFromContributionCloud) {
			requestSeek(selectedWordFromContributionCloud.startTime);
			videoPlay();
		} else if (arrayOfFirstWords?.length) {
			p5.playTurnSnippets(arrayOfFirstWords);
		}
	};

	p5.playTurnSnippets = async (turns: any[]) => {
		if (isPlayingTurnSnippets) return;
		isPlayingTurnSnippets = true;

		try {
			for (const turn of turns) {
				if (!isPlayingTurnSnippets) break;
				requestSeek(turn.startTime);
				videoPlay();
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		} finally {
			videoPause();
			isPlayingTurnSnippets = false;
		}
	};

	p5.stopTurnSnippets = () => {
		isPlayingTurnSnippets = false;
	};

	p5.fillAllData = () => {
		p5.setAnimationCounter(transcript.wordArray.length);
	};

	p5.fillSelectedData = () => {
		if (!p5.dynamicData) return; // Guard against calls before setup completes
		p5.dynamicData.setEndIndex(p5.animationCounter);
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

	p5.overRect = (x: number, y: number, boxWidth: number, boxHeight: number) => {
		if (!canHover) return false;
		return p5.mouseX >= x && p5.mouseX <= x + boxWidth && p5.mouseY >= y && p5.mouseY <= y + boxHeight;
	};

	p5.windowResized = () => {
		if (!p5.dynamicData) return; // Guard against calls before setup completes
		const { width, height } = p5.getContainerSize();
		p5.resizeCanvas(width, height);
		p5.fillSelectedData();
	};

	p5.overCircle = (x: number, y: number, diameter: number) => {
		if (!canHover) return false;
		return p5.sqrt(p5.sq(x - p5.mouseX) + p5.sq(y - p5.mouseY)) < diameter / 2;
	};

	p5.arrayIsLoaded = (data: any) => {
		return Array.isArray(data) && data.length;
	};
};
