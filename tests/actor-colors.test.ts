import { describe, it, expect } from 'vitest';
import { assignActorColors } from '../src/lib/ui/actor-colors';
import type { SpeakerRole } from '../src/models/user';

/**
 * The bundled multi-agent session, which is what motivated kind-based colour:
 * one person, one primary AI, 16 tools and 7 delegated agents against a
 * 7-colour palette.
 */
function multiAgentCast(): { speakers: string[]; roles: Map<string, SpeakerRole> } {
	const speakers = ['BEN', 'CLAUDE', 'SYSTEM'];
	const roles = new Map<string, SpeakerRole>([
		['BEN', 'user'],
		['CLAUDE', 'assistant'],
		['SYSTEM', 'system']
	]);
	for (let i = 0; i < 16; i++) {
		const name = `TOOL:T${i}`;
		speakers.push(name);
		roles.set(name, 'tool');
	}
	// Delegated agents record their own rows as `assistant`, the same role the
	// primary AI carries. Only the spawn/result markers are role `agent`.
	for (let i = 0; i < 7; i++) {
		const name = `AGENT:GENERAL-PURPOSE:A${i}`;
		speakers.push(name);
		roles.set(name, 'assistant');
	}
	return { speakers, roles };
}

describe('assignActorColors', () => {
	it('gives every actor in a 25-actor session a distinct colour', () => {
		const { speakers, roles } = multiAgentCast();
		const colors = assignActorColors(speakers, roles);
		expect(colors.size).toBe(speakers.length);
		expect(new Set(colors.values()).size).toBe(speakers.length);
	});

	it('keeps the person and the primary AI on separate hues', () => {
		const { speakers, roles } = multiAgentCast();
		const colors = assignActorColors(speakers, roles);
		expect(colors.get('BEN')).not.toBe(colors.get('CLAUDE'));
	});

	it('does not hand a tool the same colour as an agent', () => {
		const { speakers, roles } = multiAgentCast();
		const colors = assignActorColors(speakers, roles);
		const toolColors = new Set(speakers.filter((s) => s.startsWith('TOOL:')).map((s) => colors.get(s)));
		const agentColors = new Set(speakers.filter((s) => s.startsWith('AGENT:')).map((s) => colors.get(s)));
		for (const c of toolColors) expect(agentColors.has(c)).toBe(false);
	});

	it('leaves a family of one on its base hue rather than shading it', () => {
		const colors = assignActorColors(['BEN', 'CLAUDE'], new Map<string, SpeakerRole>([
			['BEN', 'user'],
			['CLAUDE', 'assistant']
		]));
		expect(colors.get('BEN')).toBe('#e69f00');
		expect(colors.get('CLAUDE')).toBe('#0072b2');
	});

	it('emits valid hex and never washes out to white or black', () => {
		const { speakers, roles } = multiAgentCast();
		for (const color of assignActorColors(speakers, roles).values()) {
			expect(color).toMatch(/^#[0-9a-f]{6}$/);
			expect(color).not.toBe('#ffffff');
			expect(color).not.toBe('#000000');
		}
	});

	it('is stable across repeated assignment', () => {
		const { speakers, roles } = multiAgentCast();
		expect([...assignActorColors(speakers, roles)]).toEqual([...assignActorColors(speakers, roles)]);
	});

	it('falls back to a single hue for speakers with no declared role', () => {
		const colors = assignActorColors(['A', 'B'], new Map());
		expect(colors.size).toBe(2);
		expect(new Set(colors.values()).size).toBe(2);
	});

	it('separates delegated agents from the primary AI despite a shared role', () => {
		const { speakers, roles } = multiAgentCast();
		const colors = assignActorColors(speakers, roles);
		const claude = colors.get('CLAUDE');
		const agents = speakers.filter((s) => s.startsWith('AGENT:')).map((s) => colors.get(s));
		expect(agents).toHaveLength(7);
		for (const c of agents) expect(c).not.toBe(claude);
	});

	it('does not mistake the delegation tool for a delegated agent', () => {
		const colors = assignActorColors(
			['CLAUDE', 'TOOL:AGENT', 'AGENT:GENERAL-PURPOSE:A0'],
			new Map<string, SpeakerRole>([
				['CLAUDE', 'assistant'],
				['TOOL:AGENT', 'agent'],
				['AGENT:GENERAL-PURPOSE:A0', 'assistant']
			])
		);
		expect(colors.get('TOOL:AGENT')).not.toBe(colors.get('AGENT:GENERAL-PURPOSE:A0'));
	});
});
