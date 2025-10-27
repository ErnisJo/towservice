// Minimal event bus for cross-component notifications (no deps)
const listeners = {};

export function on(event, cb) {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(cb);
  return () => off(event, cb);
}

export function off(event, cb) {
  const set = listeners[event];
  if (set) set.delete(cb);
}

export function emit(event, payload) {
  const set = listeners[event];
  if (!set) return;
  set.forEach((fn) => {
    try { fn(payload); } catch {}
  });
}

export default { on, off, emit };
