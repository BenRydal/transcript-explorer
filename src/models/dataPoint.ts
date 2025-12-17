export class DataPoint {
	speaker: string;
	turnNumber: number;
	startTime: number;
	endTime: number;
	word: string;
	count: number;

	constructor(
		speaker: string,
		turnNumber: number,
		word: string,
		startTime: number,
		endTime: number
	) {
		this.speaker = speaker;
		this.turnNumber = turnNumber;
		this.startTime = startTime;
		this.endTime = endTime;
		this.word = word;
		this.count = 1;
	}
}
