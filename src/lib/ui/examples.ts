import { MessageSquare, Wrench, Network } from '@lucide/svelte';
import type { Component } from 'svelte';

/**
 * Built-in example transcripts.
 *
 * Shared between DataPanel (onboarding / load flow) and AppNavbar
 * (quick-access dropdown) so both discovery paths render the same
 * catalog and keep the active-selection indicator in sync.
 *
 * The actual load pipeline (fetch → parse → hydrate stores) lives in
 * `handleLoadExample` on `+page.svelte`; this module only owns the
 * static menu data so the two UI sites don't drift out of step.
 *
 * Only the Claude web-design sessions are listed here. The other datasets
 * (classroom examples, cs/cooking/trip/claude-code sessions) still ship in
 * `static/data` and stay loadable by id via `Core.getExample` — they are
 * just not offered from the sidebar or navbar. The welcome screen keeps
 * its own inlined catalog and is unaffected by this list.
 */
export interface ExampleOption {
	value: string;
	label: string;
	icon: Component;
}

export const EXAMPLES: readonly ExampleOption[] = [
	{ value: 'web-design-chat', label: 'Claude-Web-Design-Chat', icon: MessageSquare },
	{ value: 'web-design-tools', label: 'Claude-Web-Design-Tools', icon: Wrench },
	{ value: 'web-design-multi-agent', label: 'Claude-Web-Design-Multi-Agent', icon: Network }
] as const;

/**
 * Reverse-lookup from stable example id → display label. Used to
 * surface which example (if any) is currently active in chrome that
 * only has the id in hand.
 */
export const EXAMPLE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(EXAMPLES.map((e) => [e.value, e.label]));
