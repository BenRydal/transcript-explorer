/**
 * Role a speaker plays in the interaction.
 *
 * Only ever populated for transcripts whose source declares itself as AI; it
 * stays `undefined` for every human transcript, so any behaviour keyed off it
 * must treat `undefined` as an ordinary participant.
 */
export type SpeakerRole = 'user' | 'assistant' | 'tool' | 'agent' | 'system';

export interface User {
	name: string;
	color: string;
	enabled: boolean;
	role?: SpeakerRole;
}
