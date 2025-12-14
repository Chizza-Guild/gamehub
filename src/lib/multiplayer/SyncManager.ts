/**
 * Synchronizes client clocks with server for precise timing
 * Uses NTP-like algorithm to estimate clock offset
 */
export class SyncManager {
  private clockOffset: number = 0;
  private samples: number[] = [];
  private readonly SAMPLE_COUNT = 5;

  /**
   * Perform clock synchronization by measuring round-trip time
   * and estimating offset from server
   */
  async synchronize(serverTimeFn: () => Promise<number>): Promise<void> {
    this.samples = [];

    for (let i = 0; i < this.SAMPLE_COUNT; i++) {
      const clientSendTime = Date.now();
      const serverTime = await serverTimeFn();
      const clientReceiveTime = Date.now();

      // Estimate one-way latency (half of round-trip)
      const roundTripTime = clientReceiveTime - clientSendTime;
      const estimatedServerTimeAtReceive = serverTime + roundTripTime / 2;

      // Calculate offset
      const offset = estimatedServerTimeAtReceive - clientReceiveTime;
      this.samples.push(offset);

      // Small delay between samples
      if (i < this.SAMPLE_COUNT - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Use median of samples to reduce impact of outliers
    this.samples.sort((a, b) => a - b);
    this.clockOffset = this.samples[Math.floor(this.samples.length / 2)];

    console.log(`Clock synchronized. Offset: ${this.clockOffset}ms`);
  }

  /**
   * Get current synchronized time
   */
  now(): number {
    return Date.now() + this.clockOffset;
  }

  /**
   * Convert local time to synchronized time
   */
  toSyncedTime(localTime: number): number {
    return localTime + this.clockOffset;
  }

  /**
   * Convert synchronized time to local time
   */
  toLocalTime(syncedTime: number): number {
    return syncedTime - this.clockOffset;
  }

  /**
   * Get the estimated clock offset in milliseconds
   */
  getOffset(): number {
    return this.clockOffset;
  }
}
