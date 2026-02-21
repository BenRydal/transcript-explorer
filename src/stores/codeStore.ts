import { writable } from 'svelte/store';

export interface CodeEntry {
	code: string;
	color: string;
	enabled: boolean;
}

const CodeStore = writable<CodeEntry[]>([]);

export default CodeStore;
