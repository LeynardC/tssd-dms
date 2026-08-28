// Copy text to the clipboard, returning whether it worked.
//
// navigator.clipboard only exists in a secure context (HTTPS or localhost).
// This app may be served over plain HTTP on an internal network, where that
// API is undefined and calling it throws. Fall back to the old execCommand
// path, and if even that fails let the caller show a "select it manually"
// message instead of a silent no-op.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
