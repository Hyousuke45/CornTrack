import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/*
 * Register the service worker so CornTrack can be installed from Chrome and
 * opened without a network connection. Production builds only — the dev server
 * injects unbundled modules that must not be cached.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("CornTrack service worker did not register:", error);
    });
  });
}
