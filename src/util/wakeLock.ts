/**
 * Keeps the screen on while training. Browsers release the lock when the page is hidden,
 * so it is re-acquired when the page becomes visible again.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | undefined;
  private wanted = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (this.wanted && document.visibilityState === 'visible') void this.acquire();
      });
    }
  }

  async enable(): Promise<void> {
    this.wanted = true;
    await this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    await this.sentinel?.release().catch(() => undefined);
    this.sentinel = undefined;
  }

  private async acquire() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || this.sentinel && !this.sentinel.released) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
    } catch {
      // Not allowed (e.g. battery saver). Training still works, the screen may just dim.
    }
  }
}
