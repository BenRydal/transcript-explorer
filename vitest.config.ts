import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately does not load the SvelteKit plugin: these tests exercise the
// parse/factory and draw layers only: plain TypeScript, no DOM. The `$lib`
// alias is resolved here so draw modules can run against a stub sketch.
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
