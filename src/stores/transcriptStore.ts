import { writable } from 'svelte/store';
import { Transcript } from '../models/transcript';

const TranscriptStore = writable(new Transcript());
export default TranscriptStore;
