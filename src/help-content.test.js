import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HELP_CONTENT, helpContent } from "./help-content.js";

test("every reviewed setting has bilingual copy and a visible helper placement", () => {
  const review = readFileSync(new URL("../docs/helper-content-review.md", import.meta.url), "utf8");
  const approved = [...review.matchAll(/^\| (R\d{2}) \| P[01] \|/gm)].map((match) => match[1]);
  assert.deepEqual(Object.keys(HELP_CONTENT).sort(), approved.sort());

  const sources = [
    "CurveEditor.vue", "components/AdcSettings.vue", "components/AnalogDirectionEditor.vue",
    "components/ButtonDebounceControl.vue", "components/RCFilterEditor.vue",
    "components/SettingsApplyFooter.vue", "pages/AccessoryCenterPage.vue",
    "pages/ConfiguratorPage.vue",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  const placed = [...sources.matchAll(/(?:id|help-id)="(R\d{2})"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(placed)].sort(), approved, "helper placements and reviewed IDs differ");

  for (const id of approved) {
    for (const locale of ["en", "zh-CN"]) {
      const copy = helpContent(id, locale);
      assert.ok(copy?.title?.trim(), `${id} has no ${locale} title`);
      assert.ok(copy?.body?.trim(), `${id} has no ${locale} explanation`);
    }
  }
});
