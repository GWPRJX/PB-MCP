/**
 * @module main
 * Application entry point. Mounts the root {@link App} component into the
 * DOM element with id "root" wrapped in React's StrictMode for development
 * warnings.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
