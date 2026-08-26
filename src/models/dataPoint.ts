/**
 * How a row's timing was arrived at, as the converter recorded it.
 *
 * `measured` came from the log. `estimated` was inferred from content length.
 * `marker` is a fixed stub for an event the log treats as instantaneous. In
 * the bundled multi-agent session only 4% of rows are measured, so a view that
 * draws duration without saying which is which is asserting far more than it
 * knows.
 */
export type TimingProvenance = 'measured' | 'estimated' | 'marker';

export class DataPoint {
	speaker: string;
	turnNumber: number;
	startTime: number;
	endTime: number;
	word: string;
	count: number;
	codes: string[];
	/** Undefined for producers that do not declare it, which is every human transcript. */
	provenance?: TimingProvenance;

	constructor(speaker: string, turnNumber: number, word: string, startTime: number, endTime: number, provenance?: TimingProvenance) {
		this.speaker = speaker;
		this.turnNumber = turnNumber;
		this.startTime = startTime;
		this.endTime = endTime;
		this.word = word;
		this.count = 1;
		this.codes = [];
		this.provenance = provenance;
	}

	/**
	 * Creates a copy of this DataPoint with optional field overrides.
	 * Preserves count and codes automatically.
	 */
	copyWith(overrides?: Partial<Pick<DataPoint, 'speaker' | 'turnNumber' | 'word' | 'startTime' | 'endTime'>>): DataPoint {
		const dp = new DataPoint(
			overrides?.speaker ?? this.speaker,
			overrides?.turnNumber ?? this.turnNumber,
			overrides?.word ?? this.word,
			overrides?.startTime ?? this.startTime,
			overrides?.endTime ?? this.endTime,
			this.provenance
		);
		dp.count = this.count;
		dp.codes = [...this.codes];
		return dp;
	}
}
