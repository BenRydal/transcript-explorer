import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately does not load the SvelteKit plugin: these tests exercise the
// parse/factory and draw layers only, which are plain TypeScript with no DOM
// dependency, so they run headless and fast. The `$lib` alias is resolved by
// hand rather than by the plugin, so draw modules that import through it can
// be exercised against a stub sketch.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts']
	}
});
