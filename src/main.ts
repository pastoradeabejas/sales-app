import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initTheme } from './ui/theme.svelte.ts';

initTheme();
mount(App, { target: document.getElementById('app')! });
