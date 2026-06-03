import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import TranscriptStore from '../../stores/transcriptStore';
import P5Store from '../../stores/p5Store';

export function handleSpeakerToggle(id: string, visible: boolean) {
	UserStore.update((users) => users.map((u) => (u.name === id ? { ...u, enabled: visible } : u)));
}

export function handleSpeakerColorChange(id: string, color: string) {
	UserStore.update((users) => users.map((u) => (u.name === id ? { ...u, color } : u)));
	const p5Instance = get(P5Store);
	p5Instance?.fillAllData?.();
}

// Renames one speaker across UserStore AND the transcript's wordArray
// (each word stores its speaker by name). Identity is by current name  - 
// the EntityToggleList adapter uses name as id.
export function handleSpeakerRename(oldName: string, nextLabel: string) {
	const newName = nextLabel.trim();
	if (!newName || newName === oldName) return;

	// Reject duplicates  -  two speakers can't share a name.
	const users = get(UserStore);
	if (users.some((u) => u.name === newName)) return;

	TranscriptStore.update((t) => {
		t.wordArray.forEach((dp) => {
			if (dp.speaker === oldName) dp.speaker = newName;
		});
		return t;
	});

	UserStore.update((us) => us.map((u) => (u.name === oldName ? { ...u, name: newName } : u)));

	const p5Instance = get(P5Store);
	p5Instance?.fillAllData?.();
}

// Filters the speaker list down to a single speaker by disabling everyone else.
// Used by the canvas context menu's "Filter to [speaker]" action.
export function filterToSpeaker(speakerId: string) {
	UserStore.update((users) => users.map((u) => ({ ...u, enabled: u.name === speakerId })));
	const p5Instance = get(P5Store);
	p5Instance?.fillAllData?.();
}
