type EventCallback = (...args: any[]) => void;

// Add other event names here as union types
type AllowedEvents = "focus-prompt-area" | "set-prompt-area-value";

class EventEmitter {
  private events: { [key in AllowedEvents]?: EventCallback[] } = {};

  on(event: AllowedEvents, callback: EventCallback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event]?.push(callback);
  }

  emit(event: AllowedEvents, ...args: any[]) {
    this.events[event]?.forEach((callback) => callback(...args));
  }

  off(event: AllowedEvents, callback: EventCallback) {
    this.events[event] = this.events[event]?.filter((cb) => cb !== callback);
  }
}

export default new EventEmitter();
