import { onMount } from "svelte";

export interface UseResizeObserverParams {
  element: () => HTMLElement | null;
  onResize: ResizeObserverCallback;
  debounce?: number;
  box?: ResizeObserverBoxOptions;
}

export function useResizeObserver({
  element,
  onResize,
  debounce = 0,
  box = "content-box",
}: UseResizeObserverParams) {
  let observer: ResizeObserver | null = $state(null);
  let timeout: ReturnType<typeof setTimeout> | null = $state(null);

  onMount(() => {
    const el = element();

    if (!el) return;

    observer = new ResizeObserver((entries) => {
      if (debounce > 0) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => onResize(entries, observer!), debounce);
      } else {
        onResize(entries, observer!);
      }
    });

    observer.observe(el, { box });

    return () => {
      observer?.disconnect();
      if (timeout) clearTimeout(timeout);
    };
  });
}
