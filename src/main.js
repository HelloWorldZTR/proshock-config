import { createApp } from "vue";
import App from "./App.vue";
import { initializeI18n, mountI18n } from "./i18n.js";
import "./locales/zh-CN.js";
import "./styles.css";
import "./ui-corrections.css";
import "./help.css";
import "./theme.css";
import { initializeTheme } from "./theme.js";

initializeTheme();
initializeI18n();
createApp(App).mount("#app");
// Include viewport-level dialogs teleported outside #app.
mountI18n(document.body);
