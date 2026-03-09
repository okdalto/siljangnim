/**
 * BaseManager — shared base class for async-initializing managers.
 *
 * Provides an idempotent init guard: calling init() multiple times
 * is safe, only the first call runs, and concurrent calls are blocked.
 */
export default class BaseManager {
  constructor() {
    this.initialized = false;
    this._initializing = false;
  }

  /**
   * Run an init function with guard against double-init.
   * Subclasses call this from their init() method.
   *
   * @param {() => Promise<void>} initFn
   */
  async _guardedInit(initFn) {
    if (this.initialized || this._initializing) return;
    this._initializing = true;
    try {
      await initFn();
      this.initialized = true;
    } catch (err) {
      console.error(`[${this.constructor.name}] init failed:`, err);
      throw err;
    } finally {
      this._initializing = false;
    }
  }
}
