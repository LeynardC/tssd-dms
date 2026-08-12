import { createApp } from "vue";
import router from "./router";
import "./style.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import App from "./App.vue";

const app = createApp(App);

// Global safety net: catches any error thrown inside a component's
// render/setup/lifecycle that isn't already handled locally. Without this,
// an uncaught error can silently blank the whole app with nothing but a
// cryptic message in the browser console — invisible to the person using it.
app.config.errorHandler = (err, instance, info) => {
  console.error("Unhandled component error:", err, info);

  // Import dynamically to avoid a circular/early-init dependency on the
  // toast composable's shared state before the app is mounted.
  import("./composables/useToast").then(({ useToast }) => {
    const { showToast } = useToast();
    showToast(
      "Something went wrong. Please try again, or refresh the page.",
      "error",
    );
  });
};

// Same idea, but for errors in things Vue doesn't manage directly — a
// rejected Promise nobody awaited/caught, for example.
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

app.use(router).mount("#app");
