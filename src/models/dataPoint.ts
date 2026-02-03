export class DataPoint {
	speaker: string;
	turnNumber: number;
	startTime: number;
	endTime: number;
	word: string;
	count: number;

	constructor(speaker: string, turnNumber: number, word: string, startTime: number, endTime: number) {
		this.speaker = speaker;
		this.turnNumber = turnNumber;
		this.startTime = startTime;
		this.endTime = endTime;
		this.word = word;
		this.count = 1;
	}

	/**
	 * Creates a copy of this DataPoint with optional field overrides.
	 * Preserves count automatically.
	 */
	copyWith(overrides?: Partial<Pick<DataPoint, 'speaker' | 'turnNumber' | 'word' | 'startTime' | 'endTime'>>): DataPoint {
		const dp = new DataPoint(
			overrides?.speaker ?? this.speaker,
			overrides?.turnNumber ?? this.turnNumber,
			overrides?.word ?? this.word,
			overrides?.startTime ?? this.startTime,
			overrides?.endTime ?? this.endTime
		);
		dp.count = this.count;
		return dp;
	}
}
