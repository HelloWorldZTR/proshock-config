import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.vue", import.meta.url), "utf8");

test("live preview stays on the bounded 20 Hz Feature path", () => {
  const pollStart = appSource.indexOf("async function pollLiveState()");
  const rawRead = appSource.indexOf("const raw = await getRaw();", pollStart);
  const analogRead = appSource.indexOf("await pollAnalogSnapshot();", rawRead);

  assert.match(appSource, /const PREVIEW_POLL_MS = 50;/);
  assert.ok(pollStart >= 0, "Feature preview poller must be present");
  assert.ok(rawRead > pollStart, "raw Feature snapshot must be read first");
  assert.ok(analogRead > rawRead, "processed Feature snapshot must follow raw input");
  assert.match(
    appSource,
    /window\.setInterval\(pollLiveState, PREVIEW_POLL_MS\)/,
  );
  assert.doesNotMatch(appSource, /navigator\.getGamepads/);
  assert.doesNotMatch(appSource, /addEventListener\("inputreport"/);
});
