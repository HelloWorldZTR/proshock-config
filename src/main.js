import { createApp } from "vue";
import App from "./App.vue";
import { initializeI18n, mountI18n } from "./i18n.js";
import "./locales/zh-CN.js";
import "./styles.css";

initializeI18n();
createApp(App).mount("#app");
mountI18n(document.querySelector("#app"));
