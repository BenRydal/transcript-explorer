export class DataPoint {
	speaker: string;
	turnNumber: number;
	startTime: number;
	endTime: number;
	word: string;
	order: number;
	count: number;
	useWordCountsAsFallback: boolean = false;

	constructor(
		speaker: string,
		turnNumber: number,
		word: string,
		order: number,
		startTime: number,
		endTime: number,
		useWordCountsAsFallback: boolean
	) {
		this.speaker = speaker;
		this.turnNumber = turnNumber;
		this.startTime = startTime;
		this.endTime = endTime;
		this.word = word;
		this.order = order;
		this.count = 1;
		this.useWordCountsAsFallback = useWordCountsAsFallback;
	}
}
