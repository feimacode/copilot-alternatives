import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	resolve: {
		alias: {
			'vscode': path.resolve(__dirname, 'src/test/vscode-shim.ts'),
		},
	},
	test: {
		include: ['src/**/*.spec.ts'],
		globals: false,
	},
});
