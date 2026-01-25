export interface Timeline {
	leftMarker: number;
	rightMarker: number;
	startTime: number;
	endTime: number;
	currTime: number;
	isAnimating: boolean;
}

export function createTimeline(): Timeline {
	return {
		leftMarker: 0,
		rightMarker: 0,
		startTime: 0,
		endTime: 0,
		currTime: 0,
		isAnimating: false
	};
}
