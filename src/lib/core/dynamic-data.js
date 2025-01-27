import { DataPoint } from '../../models/dataPoint.ts';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import { get } from 'svelte/store';

let config;

ConfigStore.subscribe((value) => {
	config = value;
});

export class DynamicData {
	constructor(sketch) {
		this.sk = sketch;
		this.dynamicWordArray = [];
		this.stopWords = ['the', 'of', 'and', 'is', 'to', 'in', 'a', 'from', 'by', 'that', 'with', 'this', 'as', 'an', 'are', 'its', 'at', 'for'];
	}

	update(index) {
		const animationWord = new DataPoint(index.speaker, index.turnNumber, index.word, index.order, index.startTime, index.endTime);
		// add this line to show repeated words in CC for selected time: && this.isInTimeRange(animationWord.startTime, animationWord.endTime)
		if (!this.isStopWord(animationWord.word)) {
			this.updateWordCounts(animationWord);
		}
	}

	removeLastElement() {
		this.dynamicWordArray.pop();
	}

	updateWordCounts(index) {
		const foundWords = this.dynamicWordArray.filter((e) => e.word === index.word); // return array of all matching words
		// This line will instead only increment counts on words spoken by SAME speaker, also would need to update hovering techniques in CC
		// const foundWords = this.dynamicWordArray.filter(function (currentElement) {
		//     return currentElement.word === index.word && currentElement.speaker === index.speaker;
		// });
		if (foundWords.length) {
			if (config.lastWordToggle) {
				index.count += foundWords[foundWords.length - 1].count; // Increments last word by previous last word in CC
				if (config.echoesToggle) {
					foundWords[foundWords.length - 1].count = 1; // also add this line if you want to reset and highlight ONLY last word, not incremental echo
				}
			} else {
				foundWords[0].count++; // Increment first word count/makes only first word bigger in CC
			}
		}
		this.dynamicWordArray.push(index);
	}

	isStopWord(stringWord) {
		if (config.stopWordsToggle) return this.stopWords.includes(stringWord.toLowerCase());
		else return false;
	}

	splitIntoArrays(sortedAnimationWordArray, getKey) {
		const categorized = sortedAnimationWordArray.reduce((acc, item) => {
			const key = getKey(item);
			// Initialize the category in the accumulator if it doesn't exist
			if (!acc[key]) {
				acc[key] = [];
			}
			// Add the item to the appropriate category
			if (this.isInTimeRange(item.startTime, item.endTime)) {
				acc[key].push(item);
			}
			return acc;
		}, {});
		return categorized; // 'categorized' is now an object with keys as categories and values as arrays of items
	}

	isInTimeRange(startTime, endTime) {
		const timeline = get(TimelineStore);
		return startTime >= timeline.getLeftMarker() && endTime <= timeline.getRightMarker();
	}

	getDynamicArrayForDistributionDiagram() {
		let sortedAnimationWordArrayDeepCopy = this.getAnimationArrayDeepCopy().sort((a, b) => a.order - b.order); // always sort by order for distribution diagrams
		return this.sk.dynamicData.splitIntoArrays(sortedAnimationWordArrayDeepCopy, (item) => item.order);
	}

	getDynamicArrayForTurnChart() {
		return this.splitIntoArrays(this.getAnimationArrayDeepCopy(), (item) => item.turnNumber); // split into arrays by turn number
	}

	getDynamicArraySortedForContributionCloud() {
		let curAnimationArray = this.getAnimationArrayDeepCopy();
		if (config.sortToggle) curAnimationArray.sort((a, b) => b.count - a.count); // sort descending by word count
		if (config.separateToggle) curAnimationArray.sort((a, b) => a.order - b.order); // only sort by order if not in paragraph mode
		return curAnimationArray;
	}

	getAnimationArrayDeepCopy() {
		return JSON.parse(JSON.stringify(this.dynamicWordArray));
	}

	clear() {
		this.dynamicWordArray = [];
	}
}
