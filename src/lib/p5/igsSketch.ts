import P5Store from '../../stores/p5Store';
import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import type { User } from '../../models/user';

import { VideoController, Draw, DynamicData, SketchController } from '..';

import TranscriptStore from '../../stores/transcriptStore.js';
import { get } from 'svelte/store';

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
		p5.sketchController = new SketchController(p5);
		p5.dynamicData = new DynamicData(p5);
		p5.videoController = new VideoController(p5);
		p5.SPACING = 25;
		p5.toolTipTextSize = 30;
		p5.textFont(p5.font);
		p5.animationCounter = 0; // controls animation of data
	};

	p5.draw = () => {
		const transcript = get(TranscriptStore);
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
			} else if (currConfig.distributionDiagramToggle && p5.sketchController.arrayOfFirstWords.length) {
				p5.videoController.playForDistributionDiagram(p5.sketchController.arrayOfFirstWords);
			} else if (currConfig.turnChartToggle) {
				p5.videoController.playForTurnChart(p5.sketchController.getTimeValueFromPixel(p5.mouseX));
			} else if (currConfig.contributionCloudToggle && p5.sketchController.selectedWordFromContributionCloud !== undefined) {
				p5.videoController.playForContributionCloud(p5.videoController.jumpTime);
			} else {
				if (p5.sketchController.arrayOfFirstWords.length) {
					p5.videoController.playForDistributionDiagram(p5.sketchController.arrayOfFirstWords);
				} else if (p5.sketchController.selectedWordFromContributionCloud !== undefined) {
					p5.videoController.playForContributionCloud(p5.videoController.jumpTime);
				} else {
					p5.videoController.playForTurnChart(p5.sketchController.getTimeValueFromPixel(p5.mouseX));
				}
			}
		}
	};

	p5.dataIsLoaded = (data: any) => {
		return data != null; // in javascript this tests for both undefined and null values
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
