import { TurnChart } from './turn-chart.js';
import { ContributionCloud } from './contribution-cloud.js';
import { DistributionDiagram } from './distribution-diagram.js';
import ConfigStore from '../../stores/configStore';
import EditorStore from '../../stores/editorStore';
import { resetTooltipFrame, finalizeTooltipFrame } from '../../stores/tooltipStore';

let currConfig;

ConfigStore.subscribe((data) => {
	currConfig = data;
});

export class Draw {
	constructor(sketch) {
		this.sk = sketch;
	}

	drawViz() {
		// Reset tooltip state at start of each frame
		resetTooltipFrame();

		if (currConfig.distributionDiagramToggle) {
			this.updateDistributionDiagram(this.getFullScreenPos());
		} else if (currConfig.turnChartToggle) {
			this.updateTurnChart(this.getFullScreenPos());
		} else if (currConfig.contributionCloudToggle) {
			this.updateContributionCloud(this.getFullScreenPos());
		} else {
			this.drawDashboard();
		}

		// Hide tooltip if nothing requested it this frame
		finalizeTooltipFrame();
	}

	updateDistributionDiagram(pos) {
		const distributionDiagram = new DistributionDiagram(this.sk, pos);
		distributionDiagram.draw(this.sk.dynamicData.getDynamicArrayForDistributionDiagram());
		ConfigStore.update((currConfig) => {
			return { ...currConfig, arrayOfFirstWords: distributionDiagram.localArrayOfFirstWords };
		});
		// Sync to EditorStore for transcript editor highlighting
		const firstWords = distributionDiagram.localArrayOfFirstWords;
		if (firstWords && firstWords.length > 0) {
			EditorStore.update((state) => ({
				...state,
				selection: {
					...state.selection,
					highlightedSpeaker: firstWords[0]?.speaker || null,
					selectedTurnNumber: null,
					selectedWordIndex: null,
					selectionSource: 'distributionDiagram'
				}
			}));
		}
	}

	updateTurnChart(pos) {
		const turnChart = new TurnChart(this.sk, pos);
		turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
		const selectedTurn = turnChart.userSelectedTurn;
		ConfigStore.update((currConfig) => {
			return { ...currConfig, firstWordOfTurnSelectedInTurnChart: selectedTurn.turn[0] };
		});
		// Sync to EditorStore for transcript editor highlighting
		if (selectedTurn && selectedTurn.turn && selectedTurn.turn.length > 0) {
			EditorStore.update((state) => ({
				...state,
				selection: {
					...state.selection,
					selectedTurnNumber: selectedTurn.turn[0]?.turnNumber ?? null,
					highlightedSpeaker: null,
					selectedWordIndex: null,
					selectionSource: 'turnChart'
				}
			}));
		}
	}

	updateContributionCloud(pos) {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		ConfigStore.update((currConfig) => {
			return { ...currConfig, selectedWordFromContributionCloud: hoveredWord };
		});
		// Sync to EditorStore for transcript editor highlighting
		if (hoveredWord) {
			EditorStore.update((state) => ({
				...state,
				selection: {
					...state.selection,
					selectedTurnNumber: hoveredWord.turnNumber ?? null,
					highlightedSpeaker: null,
					selectedWordIndex: null,
					selectionSource: 'contributionCloud'
				}
			}));
		}
	}

	drawDashboard() {
		const dd = this.getDashBoardBottomLeft();
		const tc = this.getDashBoardTop();
		const cc = this.getDashBoardBottomRight();
		this.drawDashboardBackground(dd, tc, cc);
		this.updateTurnChart(this.getDashBoardTop());
		this.updateContributionCloud(this.getDashBoardBottomRight());
		this.updateDistributionDiagram(this.getDashBoardBottomLeft()); // draw last to display dd text over other visualizations
	}

	drawDashboardBackground(dd, tc, cc) {
		this.sk.stroke(200);
		this.sk.strokeWeight(2);
		this.sk.line(dd.x, cc.y, cc.width, dd.y);
		this.sk.line(dd.width, dd.y, dd.width, cc.height);
	}

	getFullScreenPos() {
		return {
			x: this.sk.SPACING,
			y: this.sk.SPACING,
			width: this.sk.width - this.sk.SPACING,
			height: this.sk.height - this.sk.SPACING
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
