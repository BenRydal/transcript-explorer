import type p5 from 'p5';
import { DataPoint } from '../../models/dataPoint';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { get } from 'svelte/store';
import { clearScalingCache, clearCloudBuffer } from '../draw/contribution-cloud';

let config: ConfigStoreType;

ConfigStore.subscribe((value) => {
	config = value;
});

export class DynamicData {
	sk: p5;
	dynamicWordArray: DataPoint[];
	wordMap: Map<string, DataPoint[]>; // O(1) lookup by word text
	stopWords: string[];
	stopWordsSet: Set<string>; // O(1) stop word lookup

	constructor(sketch: p5) {
		this.sk = sketch;
		this.dynamicWordArray = [];
		this.wordMap = new Map();
		this.stopWords = this.getStopWords();
		this.stopWordsSet = new Set(this.stopWords);
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
		return this.stopWordsSet.has(stringWord.toLowerCase());
	}

	removeLastElement(): void {
		const removed = this.dynamicWordArray.pop();
		if (removed) {
			const wordList = this.wordMap.get(removed.word);
			if (wordList) {
				wordList.pop();
				if (wordList.length === 0) {
					this.wordMap.delete(removed.word);
				}
			}
		}
	}

	updateWordCounts(index: DataPoint): void {
		const wordKey = index.word;
		const foundWords = this.wordMap.get(wordKey);
		if (foundWords) {
			if (config.lastWordToggle) {
				index.count += foundWords[foundWords.length - 1].count;
				if (!config.echoWordsToggle) {
					foundWords[foundWords.length - 1].count = 1;
				}
			} else {
				foundWords[0].count++;
			}
			foundWords.push(index);
		} else {
			this.wordMap.set(wordKey, [index]);
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
		return startTime >= timeline.leftMarker && endTime <= timeline.rightMarker;
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
		if (config.sortToggle) curAnimationArray.sort((a, b) => b.count - a.count);
		if (config.separateToggle) {
			const users = get(UserStore);
			const speakerOrder = new Map(users.map((u, i) => [u.name, i]));
			curAnimationArray.sort((a, b) => (speakerOrder.get(a.speaker) ?? 999) - (speakerOrder.get(b.speaker) ?? 999));
		}
		return curAnimationArray;
	}

	getAnimationArrayDeepCopy(): DataPoint[] {
		return this.dynamicWordArray.map((dp) => {
			const copy = new DataPoint(dp.speaker, dp.turnNumber, dp.word, dp.startTime, dp.endTime);
			copy.count = dp.count;
			return copy;
		});
	}

	clear(): void {
		this.dynamicWordArray = [];
		this.wordMap.clear();
		clearScalingCache();
		clearCloudBuffer();
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
