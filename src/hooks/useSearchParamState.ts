import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * A choice that lives in the URL rather than in component state.
 *
 * Which player, which metric and which comparison group were all `useState`, with three
 * consequences worth fixing: the choice was lost on every navigation, the same player had to
 * be picked again in each view, and nothing a coach was looking at could be sent to anyone. A
 * link to "Jonas, 30-yard dash, last 12 months" simply did not exist.
 *
 * The fallback is never written to the URL, so a default view has a clean address and only
 * deliberate choices show up in it.
 */
export function useSearchParamState(
  key: string,
  fallback: string,
  { push = false }: { push?: boolean } = {},
): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;

  const setValue = useCallback(
    (next: string) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (!next || next === fallback) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        // A filter change is not a place in history worth going back to; picking a different
        // player is, so that the browser's back button behaves the way it looks like it should.
        { replace: !push },
      );
    },
    [key, fallback, push, setParams],
  );

  return [value, setValue];
}
