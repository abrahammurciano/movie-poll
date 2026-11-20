import { defineConfig } from 'vitest/config';

// Security-rules tests run against the Firestore emulator via
// `npm run test:rules` (firebase emulators:exec sets FIRESTORE_EMULATOR_HOST).
export default defineConfig({
	test: {
		include: ['rules-tests/**/*.test.ts'],
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
