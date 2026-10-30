import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const target = document.getElementById('app')!

// GitHub Pages can't send frame-ancestors, so refuse to run inside another site's frame, where a
// hidden overlay could trick people into confirming an import.
if (window.top === window.self) {
  mount(App, { target })
} else {
  target.textContent = "MacroFactor to Hevy can't run inside another site. Open it in its own tab."
}
