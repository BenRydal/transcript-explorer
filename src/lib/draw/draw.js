import { TurnChart } from './turn-chart.js';
import { ContributionCloud } from './contribution-cloud.js';
import { DistributionDiagram } from './distribution-diagram.js';
import ConfigStore from '../../stores/configStore';
import TimelineStore from '../../stores/timelineStore';
import { get } from 'svelte/store';

export class Draw {
	constructor(sketch) {
		this.sk = sketch;
	}

	drawViz() {
		const drawMode = get(ConfigStore);
		if (drawMode.distributionDiagramToggle) {
			this.resetAll();
			this.updateDistributionDiagram(this.getFullScreenPos());
		} else if (drawMode.turnChartToggle) {
			this.resetAll();
			this.updateTurnChart(this.getFullScreenPos());
		} else if (drawMode.contributionCloudToggle) {
			this.resetForCC();
			this.updateContributionCloud(this.getFullScreenPos());
		} else {
			this.drawDashboard();
		}
	}

	updateDistributionDiagram(pos) {
		const distributionDiagram = new DistributionDiagram(this.sk, pos);
		distributionDiagram.draw(this.sk.dynamicData.getDynamicArrayForDistributionDiagram());
	}

	updateTurnChart(pos) {
		const turnChart = new TurnChart(this.sk, pos);
		turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
	}

	updateContributionCloud(pos) {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const curAnimationArray = this.sk.dynamicData.getDynamicArraySortedForContributionCloud();
		const timeline = get(TimelineStore);
		for (const index of curAnimationArray) {
			if (this.between(index.startTime, timeline.getLeftMarker(), timeline.getRightMarker())) contributionCloud.draw(index);
		}
		this.sk.sketchController.selectedWordFromContributionCloud = contributionCloud.selectedWordFromContributionCloud;
		if (contributionCloud.yPosDynamic > pos.height) this.sk.sketchController.updateScalingVars();
	}

	drawDashboard() {
		const dd = this.getDashBoardBottomLeft();
		const tc = this.getDashBoardTop();
		const cc = this.getDashBoardBottomRight();
		this.drawDashboardBackground(dd, tc, cc);
		this.resetVizVarsForDashboard(dd, tc, cc);
		this.updateDistributionDiagram(this.getDashBoardBottomLeft());
		this.updateTurnChart(this.getDashBoardTop());
		this.updateContributionCloud(this.getDashBoardBottomRight());
	}

	drawDashboardBackground(dd, tc, cc) {
		this.sk.stroke(200);
		this.sk.strokeWeight(2);
		this.sk.line(dd.x, cc.y, cc.width, dd.y);
		this.sk.line(dd.width, dd.y, dd.width, cc.height);
	} // // creates/returns new sorted array but maintains current dynamicArray order right?

	resetVizVarsForDashboard(dd, tc, cc) {
		if (this.sk.overRect(tc.x, tc.y, tc.width, tc.height)) {
			this.resetAll();
		} else if (this.sk.overRect(dd.x, dd.y, dd.width, dd.height)) {
			this.resetAll();
		} else if (this.sk.overRect(cc.x, cc.y, cc.width, cc.height)) {
			this.resetForCC();
		}
	}

	resetAll() {
		this.sk.sketchController.arrayOfFirstWords = [];
		this.sk.sketchController.selectedWordFromContributionCloud = undefined;
		this.sk.sketchController.firstWordOfTurnSelectedInTurnChart = undefined;
	}

	resetForCC() {
		this.sk.sketchController.arrayOfFirstWords = [];
		this.sk.sketchController.firstWordOfTurnSelectedInTurnChart = undefined;
	}

	between(x, min, max) {
		return x >= min && x <= max;
	}

	getFullScreenPos() {
		return {
			x: this.sk.SPACING,
			y: this.sk.SPACING,
			width: this.sk.width - this.sk.SPACING,
			height: this.sk.height - 3 * this.sk.SPACING
		};
	}

	getDashBoardTop() {
		const fullScreen = this.getFullScreenPos();
		return {
			...fullScreen,
			height: (fullScreen.height - this.sk.SPACING) / 2
		};
	}

	getDashBoardBottomLeft() {
		const fullScreen = this.getFullScreenPos();
		return {
			x: fullScreen.x,
			y: fullScreen.y + (fullScreen.height - this.sk.SPACING) / 2,
			width: (fullScreen.width - this.sk.SPACING) / 2,
			height: fullScreen.height
		};
	}

	getDashBoardBottomRight() {
		const fullScreen = this.getFullScreenPos();
		return {
			x: fullScreen.x + (fullScreen.width - this.sk.SPACING) / 2,
			y: fullScreen.y + (fullScreen.height - this.sk.SPACING) / 2,
			width: fullScreen.width,
			height: fullScreen.height
		};
	}
}
