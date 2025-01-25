// import type { DataPoint } from './dataPoint';

export class User {
	enabled: boolean; // Whether the user is enabled
	name: string; // Name of the user
	color: string; // Color of the user's trail
	//dataTrail: DataPoint[]; // Array of Data points //TODO: may remove this if data not stored in user
	//conversationIsLoaded: boolean; // Whether the user's conversation data is loaded

	constructor(color: string, enabled = true, name = '') {
		this.enabled = enabled;
		this.name = name;
		this.color = color;
		//this.dataTrail = dataTrail;
		//this.conversationIsLoaded = movementIsLoaded;
	}
}
