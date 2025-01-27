import P5Store from '../../stores/p5Store';
import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import type { User } from '../../models/user';

import { VideoController, Draw, DynamicData, SketchController } from '..';

import TranscriptStore from '../../stores/transcriptStore.js';
import { get } from 'svelte/store';

let users: User[] = [];
let timeline;
let animationRate = 0.05;

TimelineStore.subscribe((data) => {
	timeline = data;
});

UserStore.subscribe((data) => {
	users = data;
});

export const igsSketch = (p5: any) => {
	P5Store.set(p5);

	p5.preload = () => {
		p5.font = p5.loadFont('/fonts/PlusJakartaSans/VariableFont_wght.ttf');
	};

	p5.setup = () => {
		const navbarHeight = (document.querySelector('.navbar') as HTMLElement).offsetHeight;
		const bottomNavHeight = (document.querySelector('.btm-nav') as HTMLElement).offsetHeight;
		const availableHeight = window.innerHeight - navbarHeight - bottomNavHeight;
		p5.createCanvas(window.innerWidth, availableHeight);
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
			p5.updateAnimation(transcript.wordArray);
			const render = new Draw(p5);
			render.drawViz();
		}
	};

	p5.updateAnimation = function (wordArray) {
		if (p5.animationCounter < wordArray.length) {
			p5.dynamicData.update(wordArray[p5.animationCounter]);
			p5.animationCounter++; // controls pace of animation/updating of words
		} else {
			p5.frameRate(60);
		}
	};

	p5.mouseMoved = () => {
		p5.loop();
	};

	p5.dataIsLoaded = (data: any) => {
		return data != null; // in javascript this tests for both undefined and null values
	};

	// TODO: This needs to be moved eventually
	// Used by `timeline-panel.js` to determine whether to draw the timeline
	p5.overRect = (x: number, y: number, boxWidth: number, boxHeight: number) => {
		return p5.mouseX >= x && p5.mouseX <= x + boxWidth && p5.mouseY >= y && p5.mouseY <= y + boxHeight;
	};

	p5.windowResized = () => {
		const navbarHeight = (document.querySelector('.navbar') as HTMLElement).offsetHeight;
		const bottomNavHeight = (document.querySelector('.btm-nav') as HTMLElement).offsetHeight;
		const availableHeight = window.innerHeight - navbarHeight - bottomNavHeight;

		p5.resizeCanvas(window.innerWidth, availableHeight);
		//p5.gui = new SketchGUI(p5); // update GUI vars
		// p5.GUITEXTSIZE = p5.width / 70;
		// p5.textSize(p5.GUITEXTSIZE);
		//p5.handle3D = new Handle3D(p5, p5.handle3D.getIs3DMode()); // update 3D display vars, pass current 3D mode
		p5.loop();
	};

	p5.overCircle = (x: number, y: number, diameter: number) => {
		return p5.sqrt(p5.sq(x - p5.mouseX) + p5.sq(y - p5.mouseY)) < diameter / 2;
	};

	p5.arrayIsLoaded = (data: any) => {
		return Array.isArray(data) && data.length;
	};

	// p5.updateAnimation = () => {
	// 	if (timeline.getCurrTime() < timeline.getEndTime()) p5.continueAnimation();
	// 	else p5.endAnimation();
	// };

	// p5.continueAnimation = () => {
	// 	let timeToSet = 0;
	// 	// Use animationRate from ConfigStore
	// 	if (p5.videoController.isLoadedAndIsPlaying()) {
	// 		timeToSet = p5.videoController.getVideoPlayerCurTime();
	// 	} else {
	// 		timeToSet = timeline.getCurrTime() + animationRate;
	// 	}
	// 	TimelineStore.update((timeline) => {
	// 		timeline.setCurrTime(timeToSet);
	// 		return timeline;
	// 	});
	// };

	// p5.endAnimation = () => {
	// 	TimelineStore.update((timeline) => {
	// 		timeline.setIsAnimating(false);
	// 		return timeline;
	// 	});
	// };
};
