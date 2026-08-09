import { createApp } from "vue";
import router from "./router";
import "./style.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import App from "./App.vue";

createApp(App).use(router).mount("#app");
