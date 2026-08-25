import { ref, onMounted, onUnmounted } from "vue";

export interface FloatingMenuOptions {
  menuWidth?: number;
  menuHeightEstimate?: number;
  viewportMargin?: number;
}

// Shared "kebab menu" positioning logic: computes a fixed-position spot
// next to the clicked button, flips above/below based on available space,
// tracks the anchor on scroll/resize, and closes on outside click or Escape.
// Used by FileExplorer.vue (files/folders) and CreateStaffAccount.vue
// (staff rows) — previously each had its own copy of this logic.
export function useFloatingMenu<T>(options: FloatingMenuOptions = {}) {
  const {
    menuWidth = 192,
    menuHeightEstimate = 260,
    viewportMargin = 8,
  } = options;

  const openTarget = ref<T | null>(null);
  const position = ref({ top: 0, left: 0 });
  const activeButtonEl = ref<HTMLElement | null>(null);

  function computePosition(button: HTMLElement) {
    const rect = button.getBoundingClientRect();

    let left = rect.right - menuWidth;
    left = Math.max(viewportMargin, left);
    left = Math.min(left, window.innerWidth - menuWidth - viewportMargin);

    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= menuHeightEstimate
        ? rect.bottom + 4
        : rect.top - menuHeightEstimate - 4;

    return { top: Math.max(viewportMargin, top), left };
  }

  function openMenu(target: T, event: MouseEvent) {
    const button = event.currentTarget as HTMLElement;
    if (openTarget.value === target) {
      closeMenu();
      return;
    }
    activeButtonEl.value = button;
    position.value = computePosition(button);
    openTarget.value = target;
  }

  function closeMenu() {
    openTarget.value = null;
    activeButtonEl.value = null;
  }

  // A floating menu should track its anchor button as the page scrolls —
  // not just disappear. Only auto-close if the button has scrolled fully
  // out of view, since a menu with no visible anchor looks disconnected.
  function handleReposition() {
    if (!activeButtonEl.value) return;
    const rect = activeButtonEl.value.getBoundingClientRect();
    const fullyOffscreen =
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth;
    if (fullyOffscreen) {
      closeMenu();
      return;
    }
    position.value = computePosition(activeButtonEl.value);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeMenu();
  }

  onMounted(() => {
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("keydown", handleKeydown);
  });
  onUnmounted(() => {
    window.removeEventListener("click", closeMenu);
    window.removeEventListener("scroll", handleReposition, true);
    window.removeEventListener("resize", handleReposition);
    window.removeEventListener("keydown", handleKeydown);
  });

  return { openTarget, position, openMenu, closeMenu };
}
