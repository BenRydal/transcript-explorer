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
		this.userMap = createUserMap(this.users);
		// Merge the four cohesive stores into a single snapshot. The viz draw
		// classes receive this merged object as `ctx.config` and access any
		// field regardless of which store it lives in.
		this.config = {
			...get(VizStore),
			...get(FiltersStore),
			...get(AppSettingsStore),
			...get(UIStateStore)
		};
		this.codeColorMap = buildCodeColorMap(get(CodeStore));
		this.hover = get(HoverStore);
		this.transcript = get(TranscriptStore);
		this.timeline = get(TimelineStore);
		// Snapshot of --te-* tokens resolved off <html>. Kept fresh by the
		// MutationObserver in igsSketch.ts (see `refreshDrawTheme`).
		this.theme = getDrawTheme();
	}
}
