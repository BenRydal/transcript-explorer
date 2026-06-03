import type { ParticipantRole } from './interaction/schema';

export interface User {
	name: string;
	color: string;
	enabled: boolean;
	/**
	 * Optional normalized role of this participant when the transcript was
	 * derived from an interaction session. Unset for plain transcripts.
	 */
	role?: ParticipantRole;
}
