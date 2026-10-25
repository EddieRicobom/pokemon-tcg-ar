import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import './selection-ui.css';
import { watchForNewVersion } from './app/stale-build';

watchForNewVersion();
createApp(App).mount('#app');
