import type { DataPoint } from './dataPoint';

export type TimingMode = 'untimed' | 'startOnly' | 'startEnd';

/**
 * What kind of interaction this transcript records.
 *
 * `human` is the default for every input path. `ai` is set only when a source
 * declares itself — never inferred from speaker names, since human corpora
 * legitimately contain speakers called "Agent" or a column called "role".
 *
 * Behaviour must be gated on `=== 'ai'` and never on `!== 'human'`, so that a
 * transcript restored from an older saved session, where the field is absent,
 * is treated as human.
 */
export type SourceKind = 'human' | 'ai';

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
	sourceKind: SourceKind;

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
		this.sourceKind = 'human';
	}
}
