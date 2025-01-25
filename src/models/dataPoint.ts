export class DataPoint {
	speaker: string;
	turnNumber: number;
	startTime: number;
	endTime: number;
	word: string;
	order: number;
	count: number;

	constructor(speaker: string, turnNumber: number, word: string, order: number, startTime: number, endTime: number) {
		this.speaker = speaker;
		this.turnNumber = turnNumber;
		this.startTime = startTime;
		this.endTime = endTime;
		this.word = word;
		this.order = order;
		this.count = 1;
	}
}
