/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
	base: '/',
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': `${import.meta.dirname}/src`,
		},
	},
	test: {
		// Security-rules tests need the Firestore emulator; run them with
		// `npm run test:rules`, not the plain unit-test run.
		exclude: ['**/node_modules/**', 'rules-tests/**'],
	},
})
