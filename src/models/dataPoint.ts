export class DataPoint {
	speaker: string;
	turnNumber: number;
	startTime: number;
	endTime: number;
	word: string;
	displayWord: string;
	count: number;

	constructor(speaker: string, turnNumber: number, word: string, startTime: number, endTime: number, displayWord?: string) {
		this.speaker = speaker;
		this.turnNumber = turnNumber;
		this.startTime = startTime;
		this.endTime = endTime;
		this.word = word;
		this.displayWord = displayWord ?? word;
		this.count = 1;
	}

	/**
	 * Creates a copy of this DataPoint with optional field overrides.
	 * Preserves count and displayWord automatically.
	 */
	copyWith(overrides?: Partial<Pick<DataPoint, 'speaker' | 'turnNumber' | 'word' | 'displayWord' | 'startTime' | 'endTime'>>): DataPoint {
		const dp = new DataPoint(
			overrides?.speaker ?? this.speaker,
			overrides?.turnNumber ?? this.turnNumber,
			overrides?.word ?? this.word,
			overrides?.startTime ?? this.startTime,
			overrides?.endTime ?? this.endTime,
			overrides?.displayWord ?? this.displayWord
		);
		dp.count = this.count;
		return dp;
	}
}
