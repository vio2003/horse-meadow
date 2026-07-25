import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Belt and braces against iOS Safari's pinch-zoom and rubber-band scroll, which
// the viewport meta tag alone no longer fully prevents.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false }
)

// StrictMode is deliberately omitted. It double-invokes effects, which fights
// with the imperative refs this game leans on for per-frame state.
createRoot(document.getElementById('root')).render(<App />)
