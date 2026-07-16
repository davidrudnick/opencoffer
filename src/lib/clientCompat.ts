/**
 * Browser APIs gated behind "secure contexts" (crypto.randomUUID,
 * navigator.clipboard) exist on HTTPS and localhost but are UNDEFINED when
 * the app is served over plain http on a LAN hostname — a normal way to run
 * a self-hosted instance. These fallbacks keep the UI working there.
 */

let counter = 0;

/** crypto.randomUUID() where available, else a unique-enough local id. */
export function clientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  counter += 1;
  return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Copy text to the clipboard; falls back to a hidden textarea + execCommand
 *  on insecure origins. Resolves false when the copy could not be performed. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
