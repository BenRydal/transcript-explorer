import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import VizStore from '../../stores/vizStore';
import FiltersStore from '../../stores/filtersStore';
import AppSettingsStore from '../../stores/appSettingsStore';
import UIStateStore from '../../stores/uiStateStore';
import type { ConfigStoreType } from '../../stores/configStore';
import CodeStore from '../../stores/codeStore';
import HoverStore, { type HoverState } from '../../stores/hoverStore';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import type { User } from '../../models/user';
import type { Transcript } from '../../models/transcript';
import type { Timeline } from '../../models/timeline';
import { createUserMap, buildCodeColorMap } from './draw-utils';
import { getDrawTheme, type DrawTheme } from './draw-theme';

/**
 * Memo for the two per-frame derived maps.
 *
 * Both are pure functions of a store value, and Svelte stores hand back the
 * same reference until something writes to them, so identity comparison is a
 * sufficient and exact invalidation check.
 */
let userMapCache: { source: User[]; value: Map<string, User> } | null = null;
function cachedUserMap(users: User[]): Map<string, User> {
	if (userMapCache?.source === users) return userMapCache.value;
	const value = createUserMap(users);
	userMapCache = { source: users, value };
	return value;
}

let codeColorMapCache: { source: unknown; value: Map<string, string> } | null = null;
function cachedCodeColorMap(codes: Parameters<typeof buildCodeColorMap>[0]): Map<string, string> {
	if (codeColorMapCache?.source === codes) return codeColorMapCache.value;
	const value = buildCodeColorMap(codes);
	codeColorMapCache = { source: codes, value };
	return value;
}

export class DrawContext {
	sk: p5;
	users: User[];
	userMap: Map<string, User>;
	config: ConfigStoreType;
	codeColorMap: Map<string, string>;
	hover: HoverState;
	transcript: Transcript;
	timeline: Timeline;
	theme: DrawTheme;

	constructor(sk: p5) {
		this.sk = sk;
		this.users = get(UserStore);
		// The speaker map is derived purely from the user list, which changes
		// only when a speaker is toggled, renamed or recoloured. Rebuilding it
		// each frame allocated one Map entry per speaker sixty times a second.
		this.userMap = cachedUserMap(this.users);
		// Merge the four cohesive stores into a single snapshot. The viz draw
		// classes receive this merged object as `ctx.config` and access any
		// field regardless of which store it lives in.
		this.config = {
			...get(VizStore),
			...get(FiltersStore),
			...get(AppSettingsStore),
			...get(UIStateStore)
		};
		this.codeColorMap = cachedCodeColorMap(get(CodeStore));
		this.hover = get(HoverStore);
		this.transcript = get(TranscriptStore);
		this.timeline = get(TimelineStore);
		// Snapshot of --te-* tokens resolved off <html>. Kept fresh by the
		// MutationObserver in igsSketch.ts (see `refreshDrawTheme`).
		this.theme = getDrawTheme();
	}
}
