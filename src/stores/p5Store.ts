import { writable } from 'svelte/store';
import type { IgsSketch } from '../lib/p5/igs-sketch-instance';

const P5Store = writable<IgsSketch | null>(null);

export default P5Store;
