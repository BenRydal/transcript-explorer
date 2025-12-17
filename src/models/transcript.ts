import type { DataPoint } from './dataPoint';

export type TimingMode = 'untimed' | 'startOnly' | 'startEnd';

export class Transcript {
	wordArray: DataPoint[];
	totalTimeInSeconds: number;
	totalConversationTurns: number;
	totalNumOfWords: number;
	largestTurnLength: number;
	largestNumOfWordsByASpeaker: number;
	largestNumOfTurnsByASpeaker: number;
	maxCountOfMostRepeatedWord: number;
	mostFrequentWord: string;
	timingMode: TimingMode;

	constructor() {
		this.wordArray = [];
		this.totalTimeInSeconds = 0;
		this.totalConversationTurns = 0;
		this.totalNumOfWords = 0;
		this.largestTurnLength = 0;
		this.largestNumOfWordsByASpeaker = 0;
		this.largestNumOfTurnsByASpeaker = 0;
		this.maxCountOfMostRepeatedWord = 0;
		this.mostFrequentWord = '';
		this.timingMode = 'untimed';
	}
}
