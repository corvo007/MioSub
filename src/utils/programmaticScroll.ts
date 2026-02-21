/** Shared flag to distinguish programmatic scrolls from user scrolls */
let _active = false;
let _timer: ReturnType<typeof setTimeout> | undefined;

/** Mark that a programmatic scroll is about to happen (covers smooth animation) */
export function markProgrammaticScroll(durationMs = 400) {
  _active = true;
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    _active = false;
  }, durationMs);
}

export function isProgrammaticScroll() {
  return _active;
}
