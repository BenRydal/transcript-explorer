import { defineConfig } from 'vitest/config';

// Deliberately does not load the SvelteKit plugin: these tests exercise the
// parse/factory layer only, which is plain TypeScript with no DOM or p5
// dependency, so they run headless and fast.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts']
	}
});
