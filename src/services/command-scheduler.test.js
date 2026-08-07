import test from "node:test";
import assert from "node:assert/strict";
import { CommandScheduler } from "./command-scheduler.js";

test("scheduler keeps one request in flight and prioritizes queued writes", async () => {
  const scheduler = new CommandScheduler();
  const order = [];
  let release;
  const first = scheduler.enqueue(async () => {
    order.push("background-start");
    await new Promise((resolve) => { release = resolve; });
    order.push("background-end");
  }, 5);
  const second = scheduler.enqueue(async () => order.push("telemetry"), 5);
  const write = scheduler.enqueue(async () => order.push("write"), 1);
  release();
  await Promise.all([first, second, write]);
  assert.deepEqual(order, ["background-start", "background-end", "write", "telemetry"]);
});
