export class User {
	enabled: boolean;
	name: string;
	color: string;

	constructor(color: string, enabled = true, name = '') {
		this.enabled = enabled;
		this.name = name;
		this.color = color;
	}
}
