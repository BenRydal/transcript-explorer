import type p5 from 'p5';
import { DataPoint } from '../../models/dataPoint';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { get } from 'svelte/store';
import { clearScalingCache } from '../draw/contribution-cloud';

let config: ConfigStoreType;

ConfigStore.subscribe((value) => {
	config = value;
});

export class DynamicData {
	sk: p5;
	dynamicWordArray: DataPoint[];
	stopWords: string[];

	constructor(sketch: p5) {
		this.sk = sketch;
		this.dynamicWordArray = [];
		this.stopWords = this.getStopWords();
	}

	// add this line to show repeated words in CC for selected time: && this.isInTimeRange(animationWord.startTime, animationWord.endTime)
	update(index: DataPoint): void {
		if (!index) return;
		const animationWord = new DataPoint(index.speaker, index.turnNumber, index.word, index.startTime, index.endTime);
		if (!config.stopWordsToggle || !this.isStopWord(animationWord.word)) {
			this.updateWordCounts(animationWord);
		}
	}

	isStopWord(stringWord: string): boolean {
		return this.stopWords.includes(stringWord.toLowerCase());
	}

	removeLastElement(): void {
		this.dynamicWordArray.pop();
	}

	updateWordCounts(index: DataPoint): void {
		const foundWords = this.dynamicWordArray.filter((e) => e.word === index.word); // return array of all matching words
		// This line will instead only increment counts on words spoken by SAME speaker, also would need to update hovering techniques in CC
		// const foundWords = this.dynamicWordArray.filter(function (currentElement) {
		//     return currentElement.word === index.word && currentElement.speaker === index.speaker;
		// });
		if (foundWords.length) {
			if (config.lastWordToggle) {
				index.count += foundWords[foundWords.length - 1].count; // Increments last word by previous last word in CC
				if (!config.echoWordsToggle) {
					foundWords[foundWords.length - 1].count = 1; // also add this line if you want to reset and highlight ONLY last word, not incremental echo
				}
			} else {
				foundWords[0].count++; // Increment first word count/makes only first word bigger in CC
			}
		}
		this.dynamicWordArray.push(index);
	}

	splitIntoArraysByNumber(sortedAnimationWordArray: DataPoint[], getKey: (item: DataPoint) => number): Record<number, DataPoint[]> {
		const categorized = sortedAnimationWordArray.reduce((acc: Record<number, DataPoint[]>, item) => {
			const key = getKey(item);
			if (!acc[key]) {
				acc[key] = [];
			}
			if (this.isInTimeRange(item.startTime, item.endTime)) {
				acc[key].push(item);
			}
			return acc;
		}, {});
		return categorized;
	}

	splitIntoArraysBySpeaker(sortedAnimationWordArray: DataPoint[]): Record<string, DataPoint[]> {
		const categorized = sortedAnimationWordArray.reduce((acc: Record<string, DataPoint[]>, item) => {
			const key = item.speaker;
			if (!acc[key]) {
				acc[key] = [];
			}
			if (this.isInTimeRange(item.startTime, item.endTime)) {
				acc[key].push(item);
			}
			return acc;
		}, {});
		return categorized;
	}

	isInTimeRange(startTime: number, endTime: number): boolean {
		const timeline = get(TimelineStore);
		return startTime >= timeline.getLeftMarker() && endTime <= timeline.getRightMarker();
	}

	getDynamicArrayForDistributionDiagram(): Record<string, DataPoint[]> {
		const animationArrayCopy = this.getAnimationArrayDeepCopy();
		return this.splitIntoArraysBySpeaker(animationArrayCopy);
	}

	getDynamicArrayForTurnChart(): Record<number, DataPoint[]> {
		return this.splitIntoArraysByNumber(this.getAnimationArrayDeepCopy(), (item) => item.turnNumber);
	}

	getDynamicArraySortedForContributionCloud(): DataPoint[] {
		let curAnimationArray = this.getAnimationArrayDeepCopy().filter((word) => this.isInTimeRange(word.startTime, word.endTime));
		if (config.sortToggle) curAnimationArray.sort((a, b) => b.count - a.count); // sort descending by word count
		if (config.separateToggle) curAnimationArray.sort((a, b) => a.speaker.localeCompare(b.speaker)); // group by speaker name
		return curAnimationArray;
	}

	getAnimationArrayDeepCopy(): DataPoint[] {
		return JSON.parse(JSON.stringify(this.dynamicWordArray));
	}

	clear(): void {
		this.dynamicWordArray = [];
		clearScalingCache();
	}

	getStopWords(): string[] {
		return [
			// Articles
			'a',
			'an',
			'the',

			// Conjunctions
			'and',
			'or',
			'but',
			'if',
			'then',
			'than',
			'because',
			'while',
			'until',
			'although',
			'though',

			// Prepositions
			'of',
			'to',
			'in',
			'from',
			'by',
			'with',
			'as',
			'at',
			'for',
			'on',
			'about',
			'into',
			'during',
			'after',
			'before',
			'above',
			'below',
			'around',
			'between',
			'under',
			'out',
			'over',
			'through',
			'off',

			// Subject pronouns
			'I',
			'you',
			'he',
			'she',
			'it',
			'we',
			'they',

			// Object pronouns
			'me',
			'him',
			'her',
			'us',
			'them',

			// Possessive pronouns
			'my',
			'your',
			'his',
			'her',
			'its',
			'our',
			'their',

			// Relative/interrogative pronouns
			'that',
			'which',
			'who',
			'whom',
			'whose',
			'what',

			// Demonstratives
			'this',
			'these',
			'those',

			// Quantifiers
			'all',
			'any',
			'some',
			'each',
			'every',
			'both',
			'either',
			'neither',
			'more',
			'most',
			'less',
			'least',
			'much',
			'many',
			'few',
			'such',
			'other',
			'another',
			'same',

			// Be verbs
			'is',
			'are',
			'was',
			'were',
			'am',
			'be',
			'been',
			'being',

			// Have verbs
			'have',
			'has',
			'had',
			'having',

			// Do verbs
			'do',
			'does',
			'did',
			'doing',

			// Modal verbs
			'can',
			'could',
			'will',
			'would',
			'may',
			'might',
			'must',
			'shall',
			'should',

			// Common verbs
			'get',
			'got',
			'getting',
			'go',
			'going',
			'gone',
			'went',
			'come',
			'coming',
			'came',
			'make',
			'made',
			'making',
			'know',
			'knew',
			'known',
			'think',
			'thought',
			'say',
			'said',
			'see',
			'saw',
			'seen',

			// Adverbs
			'not',
			'no',
			'yes',
			'here',
			'there',
			'when',
			'where',
			'how',
			'why',
			'up',
			'down',
			'even',
			'very',
			'just',
			'so',
			'only',
			'now',
			'still',
			'also',
			'too',
			'well',
			'really',
			'quite',
			'rather',
			'always',
			'never',
			'often',
			'sometimes',
			'already',
			'again',
			'back',
			'away',

			// Contractions
			"don't",
			"doesn't",
			"didn't",
			"won't",
			"can't",
			"couldn't",
			"wouldn't",
			"shouldn't",
			"isn't",
			"aren't",
			"wasn't",
			"weren't",
			"haven't",
			"hasn't",
			"hadn't",
			"i'm",
			"you're",
			"he's",
			"she's",
			"it's",
			"we're",
			"they're",
			"i've",
			"you've",
			"we've",
			"they've",
			"i'll",
			"you'll",
			"he'll",
			"she'll",
			"we'll",
			"they'll",
			"i'd",
			"you'd",
			"he'd",
			"she'd",
			"we'd",
			"they'd",
			"that's",
			"there's",
			"here's",
			"what's",
			"who's",
			"let's",

			// Spoken fillers (common in transcripts)
			'uh',
			'um',
			'like',
			'yeah',
			'okay',
			'ok',
			'oh',
			'ah',
			'gonna',
			'wanna',
			'gotta',
			'kinda',
			'sorta',
			'basically',
			'actually',
			'literally',
			'right',
			'mean'
		];
	}
}
