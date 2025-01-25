import P5Store from '../../stores/p5Store';
import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import type { User } from '../../models/user';
//import { FloorPlan, SketchGUI, Handle3D, VideoController, SetPathData } from '..';

import { VideoController } from '..';

let users: User[] = [];
let timeline, highlightToggle;
let animationRate = 0.05;

TimelineStore.subscribe((data) => {
	timeline = data;
});

ConfigStore.subscribe((data) => {
	// highlightToggle = data.highlightToggle;
	// animationRate = data.animationRate; // Subscribe to animationRate
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
		p5.createCanvas(window.innerWidth, availableHeight, p5.WEBGL);
		// p5.gui = new SketchGUI(p5);
		// p5.handle3D = new Handle3D(p5, true);
		p5.videoController = new VideoController(p5);
		// p5.floorPlan = new FloorPlan(p5);

		// Constants
		p5.GUI_TEXT_SIZE = p5.width / 70;

		// STYLES
		p5.textSize(p5.GUI_TEXT_SIZE);
		p5.textFont(p5.font);
		p5.textAlign(p5.LEFT, p5.TOP);
		p5.smooth();
	};

	p5.draw = () => {
		p5.translate(-p5.width / 2, -p5.height / 2, 0); // recenter canvas to top left when using WEBGL renderer
		p5.background(255);
		p5.circle(0, 0, 100);
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
		p5.GUITEXTSIZE = p5.width / 70;
		p5.textSize(p5.GUITEXTSIZE);
		//p5.handle3D = new Handle3D(p5, p5.handle3D.getIs3DMode()); // update 3D display vars, pass current 3D mode
		p5.loop();
	};

	p5.overCircle = (x: number, y: number, diameter: number) => {
		return p5.sqrt(p5.sq(x - p5.mouseX) + p5.sq(y - p5.mouseY)) < diameter / 2;
	};

	p5.mousePressed = () => {
		if (highlightToggle && !p5.handle3D.getIs3DModeOrTransitioning()) p5.gui.highlight.handleMousePressed();
		p5.loop();
	};

	p5.mouseReleased = () => {
		if (highlightToggle && !p5.handle3D.getIs3DModeOrTransitioning()) p5.gui.highlight.handleMouseRelease();
		p5.loop();
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
