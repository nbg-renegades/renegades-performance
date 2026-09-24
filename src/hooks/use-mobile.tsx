import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

/**
 * The viewport is an external store, so React should read it rather than keep a copy.
 *
 * This used to hold the answer in state, start it as `undefined` and fill it in from an
 * effect - which meant every caller got `false` on the first render and the real answer on
 * the second. ResponsiveDialog chooses between a Dialog and a Drawer from this, so on a
 * phone it mounted the desktop dialog and immediately swapped it for the drawer; the
 * charts sized themselves for desktop and then re-measured. useSyncExternalStore reads the
 * media query during the first render, so there is nothing to correct afterwards.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    // No window while prerendering; desktop is the safer default for a server snapshot.
    () => false,
  );
}
