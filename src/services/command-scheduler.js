/**
 * Serializes WebHID work while allowing user writes to overtake queued background reads.
 */
export class CommandScheduler {
  constructor() {
    this.queue = [];
    this.running = false;
    this.sequence = 0;
  }

  enqueue(task, priority = 3) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, priority, sequence: this.sequence, resolve, reject });
      this.sequence += 1;
      this.queue.sort((left, right) => left.priority - right.priority || left.sequence - right.sequence);
      void this.drain();
    });
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const current = this.queue.shift();
      try {
        current.resolve(await current.task());
      } catch (error) {
        current.reject(error);
      }
    }
    this.running = false;
  }
}
