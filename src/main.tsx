import { createRoot } from 'react-dom/client'
import { polyfill } from 'mobile-drag-drop'
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour'
import './index.css'
import App from './App.tsx'

polyfill({
	holdToDrag: 200,
	dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
	forceApply: /Android.+Firefox/i.test(navigator.userAgent),
})

createRoot(document.getElementById('root')!).render(<App />)

// PWA: cache the app shell for installs/offline launches (production only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
			.catch(() => {})
	})
}
