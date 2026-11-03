import { useEffect, useState } from "react";

/**
 * Chrome fires `beforeinstallprompt` when the PWA criteria are met (served
 * over HTTPS, manifest + service worker reachable). We capture the event so
 * the app can offer its own "Install app" button, and detect the
 * already-installed state so the button can hide itself.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Already running as an installed app? (standalone display mode)
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!event) return "unavailable";
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setEvent(null);
    return choice.outcome;
  };

  return { canInstall: Boolean(event) && !installed, installed, install };
}

/** Resolves once the service worker is active (used by the install hint UI). */
export async function serviceWorkerActive(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  } catch {
    return false;
  }
}
