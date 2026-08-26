import { GraduationCap, Landmark, Mic, Bot, MessageSquare, Wrench, Network } from '@lucide/svelte';
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
	{ value: 'example-5', label: 'Biden-Trump 2020 Debate', icon: Mic },
	{ value: 'claude-chat', label: 'Claude Code — Chat Only', icon: MessageSquare },
	{ value: 'claude-tools', label: 'Claude Code — With Tools', icon: Wrench },
	{ value: 'claude-agent', label: 'Claude Code — Single Agent', icon: Bot },
	{ value: 'claude-multi-agent', label: 'Claude Code — Multi-Agent', icon: Network },
	{ value: 'cs-chat', label: 'CS Course — Chat Only', icon: MessageSquare },
	{ value: 'cs-tools', label: 'CS Course — With Tools', icon: Wrench },
	{ value: 'cs-agent', label: 'CS Course — Single Agent', icon: Bot },
	{ value: 'cs-multi-agent', label: 'CS Course — Multi-Agent', icon: Network },
	{ value: 'cooking-chat', label: 'Cooking — Chat Only', icon: MessageSquare },
	{ value: 'cooking-tools', label: 'Cooking — With Tools', icon: Wrench },
	{ value: 'cooking-agent', label: 'Cooking — Single Agent', icon: Bot },
	{ value: 'cooking-multi-agent', label: 'Cooking — Multi-Agent', icon: Network },
	{ value: 'trip-chat', label: 'Trip Planning — Chat Only', icon: MessageSquare },
	{ value: 'trip-tools', label: 'Trip Planning — With Tools', icon: Wrench },
	{ value: 'trip-agent', label: 'Trip Planning — Single Agent', icon: Bot },
	{ value: 'trip-multi-agent', label: 'Trip Planning — Multi-Agent', icon: Network },
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
