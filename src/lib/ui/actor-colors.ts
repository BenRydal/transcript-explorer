import type { SpeakerRole } from '../../models/user';

/**
 * Colour assignment for AI transcripts.
 *
 * Human transcripts cycle a CVD-safe palette by speaker index, which works
 * because they hold a handful of speakers. An agentic session does not: the
 * bundled multi-agent example has 25 actors against a 7-colour palette, so
 * `index % length` gives every colour to three or four different actors. Bash
 * and Edit both render green; the primary AI shares orange with a tool.
 *
 * Actors here are coloured by what kind of participant they are, with members
 * of a kind separated by lightness. Two things follow. Collisions stop, since
 * lightness carries the within-kind distinction that hue can no longer make.
 * And kind becomes readable directly off the canvas: every tool is a shade of
 * one hue, every delegated agent a shade of another, so "which of these is an
 * agent and which is a tool" is answered by looking rather than by hovering.
 *
 * Base hues are Wong, so the five families stay distinguishable under the
 * common colour-vision deficiencies.
 */
const ROLE_HUES: Record<SpeakerRole, string> = {
	user: '#E69F00', // orange — the person
	assistant: '#0072B2', // blue — the primary AI
	agent: '#009E73', // bluish green — delegated agents
	tool: '#CC79A7', // reddish purple — tools
	system: '#999999' // neutral — system rows
};

/** Fallback for a speaker whose role the transcript never declares. */
const UNKNOWN_HUE = '#56B4E9';

/** Kept inside this band so no member washes out to white or crushes to black. */
const MIN_LIGHTNESS = 24;
const MAX_LIGHTNESS = 76;

/**
 * Saturation is alternated by this much between neighbouring members. Lightness
 * alone stops separating a large family once the steps round to the same byte:
 * sixteen tools across the band land about three points apart, which is close
 * enough for two of them to collide after conversion to 8-bit hex.
 */
const SATURATION_ALTERNATION = 12;

function hexToHsl(hex: string): [number, number, number] {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l * 100];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
	const sN = s / 100;
	const lN = l / 100;
	const c = (1 - Math.abs(2 * lN - 1)) * sN;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = lN - c / 2;
	let rgb: [number, number, number];
	if (h < 60) rgb = [c, x, 0];
	else if (h < 120) rgb = [x, c, 0];
	else if (h < 180) rgb = [0, c, x];
	else if (h < 240) rgb = [0, x, c];
	else if (h < 300) rgb = [x, 0, c];
	else rgb = [c, 0, x];
	const hex = rgb.map((v) =>
		Math.round((v + m) * 255)
			.toString(16)
			.padStart(2, '0')
	);
	return `#${hex.join('')}`;
}

/**
 * Nudges a base hue's lightness to separate the `position`-th member of a
 * family of `size`. A family of one is left on its base colour.
 */
function shadeFor(base: string, position: number, size: number): string {
	if (size <= 1) return base.toLowerCase();
	const [h, s, l] = hexToHsl(base);
	// Spread evenly across the whole band: first member darkest, last lightest.
	const t = position / (size - 1); // 0..1
	const lightness = MIN_LIGHTNESS + t * (MAX_LIGHTNESS - MIN_LIGHTNESS);
	// Alternate saturation so neighbouring members stay apart even where the
	// lightness step is small enough to round to the same value.
	const saturation = Math.min(100, Math.max(0, s + (position % 2 === 0 ? 0 : -SATURATION_ALTERNATION)));
	return hslToHex(h, saturation, Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, lightness)));
}

/**
 * Prefix the converter writes for a delegated agent's own rows, as
 * `Agent:<type>:<id>`.
 *
 * Role alone cannot separate a delegated agent from the primary AI: an agent's
 * rows are recorded as `assistant`, so all eight speakers in the multi-agent
 * session resolve to one family and every delegated agent comes out a shade of
 * the primary AI's blue. Only the spawn and result markers carry the `agent`
 * role, and those belong to the delegation tool rather than to any agent.
 *
 * `source-kind.ts` refuses to read speaker names when *detecting* whether a
 * transcript is AI, because a human corpus can legitimately hold a speaker
 * called Agent. That reasoning does not extend here: this runs only once a
 * transcript has already declared itself AI, where the converter owns the
 * naming.
 */
const DELEGATED_AGENT_PREFIX = 'AGENT:';

/** Prefix the converter writes for a tool's rows. */
const TOOL_PREFIX = 'TOOL:';

/** Family a speaker belongs to. */
function familyOf(speaker: string, role: SpeakerRole | undefined): string {
	const upper = speaker.toUpperCase();
	if (upper.startsWith(TOOL_PREFIX)) return 'tool';
	if (upper.startsWith(DELEGATED_AGENT_PREFIX)) return 'agent';
	return role ?? 'unknown';
}

/**
 * Colour for every speaker in an AI transcript, keyed by speaker name.
 *
 * `speakers` is expected in transcript order and `roles` keyed the same way,
 * both as produced by the CSV parser.
 */
export function assignActorColors(speakers: readonly string[], roles: ReadonlyMap<string, SpeakerRole>): Map<string, string> {
	// Group speakers by family, preserving order of first appearance so the
	// assignment is stable across reloads.
	const families = new Map<string, string[]>();
	for (const speaker of speakers) {
		const key = familyOf(speaker, roles.get(speaker));
		const bucket = families.get(key);
		if (bucket) bucket.push(speaker);
		else families.set(key, [speaker]);
	}

	const colors = new Map<string, string>();
	for (const [key, members] of families) {
		const base = key === 'unknown' ? UNKNOWN_HUE : ROLE_HUES[key as SpeakerRole];
		members.forEach((speaker, i) => {
			colors.set(speaker, shadeFor(base, i, members.length).toLowerCase());
		});
	}
	return colors;
}
