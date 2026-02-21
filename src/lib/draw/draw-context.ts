import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import CodeStore from '../../stores/codeStore';
import HoverStore, { type HoverState } from '../../stores/hoverStore';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import type { User } from '../../models/user';
import type { Transcript } from '../../models/transcript';
import type { Timeline } from '../../models/timeline';
import { createUserMap, buildCodeColorMap } from './draw-utils';

export class DrawContext {
	sk: p5;
	users: User[];
	userMap: Map<string, User>;
	config: ConfigStoreType;
	codeColorMap: Map<string, string>;
	hover: HoverState;
	transcript: Transcript;
	timeline: Timeline;

	constructor(sk: p5) {
		this.sk = sk;
		this.users = get(UserStore);
		this.userMap = createUserMap(this.users);
		this.config = get(ConfigStore);
		this.codeColorMap = buildCodeColorMap(get(CodeStore));
		this.hover = get(HoverStore);
		this.transcript = get(TranscriptStore);
		this.timeline = get(TimelineStore);
	}
}
