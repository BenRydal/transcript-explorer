import { GraduationCap, Landmark, Mic } from '@lucide/svelte';
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
 */
export interface ExampleOption {
	value: string;
	label: string;
	icon: Component;
}

export const EXAMPLES: readonly ExampleOption[] = [
	{ value: 'example-1', label: 'Kindergarten Activity', icon: GraduationCap },
	{ value: 'example-3', label: '3rd Grade Discussion Odd/Even Numbers', icon: GraduationCap },
	{ value: 'example-4', label: '8th Grade Science Lesson', icon: GraduationCap },
	{ value: 'example-2', label: 'Family Gallery Visit', icon: Landmark },
	{ value: 'example-5', label: 'Biden-Trump 2020 Debate', icon: Mic }
] as const;

/**
 * Reverse-lookup from stable example id → display label. Used to
 * surface which example (if any) is currently active in chrome that
 * only has the id in hand.
 */
export const EXAMPLE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
	EXAMPLES.map((e) => [e.value, e.label])
);
