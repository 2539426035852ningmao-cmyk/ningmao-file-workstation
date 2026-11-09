/** Detect a half-open WebSocket. A readyState of OPEN alone is not proof that
 * the Worker is reachable. Only the authenticated server's pong resets the
 * deadline; arbitrary traffic must not masquerade as a heartbeat response.
 */
export class SocketHeartbeat {
  private interval: ReturnType<typeof setInterval> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly sendPing: () => void,
    private readonly onLost: () => void,
    private readonly intervalMs = 30_000,
    private readonly pongTimeoutMs = 15_000,
  ) {}

  start() {
    if (this.interval !== null) return;
    this.interval = setInterval(() => {
      if (this.deadline !== null) return;
      this.deadline = setTimeout(() => {
        this.stop();
        this.onLost();
      }, this.pongTimeoutMs);
      try {
        this.sendPing();
      } catch {
        this.stop();
        this.onLost();
      }
    }, this.intervalMs);
  }

  pong() {
    if (this.deadline !== null) {
      clearTimeout(this.deadline);
      this.deadline = null;
    }
  }

  stop() {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.deadline !== null) {
      clearTimeout(this.deadline);
      this.deadline = null;
    }
  }
}
