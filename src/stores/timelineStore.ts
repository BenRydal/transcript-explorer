import { writable } from 'svelte/store';
import { createTimeline } from '../models/timeline';

const TimelineStore = writable(createTimeline());
export default TimelineStore;
