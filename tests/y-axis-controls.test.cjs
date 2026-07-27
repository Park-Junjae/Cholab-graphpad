const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const source = readFileSync(join(__dirname, "..", "src", "index.html"), "utf8");

test("general and qPCR views expose complete Y-axis controls", () => {
  const controlIds = [
    "generalYMin",
    "generalYMax",
    "generalYTickStep",
    "generalYDecimals",
    "qpcrYMin",
    "qpcrYMax",
    "qpcrYTickStep",
    "qpcrYDecimals"
  ];

  controlIds.forEach((id) => {
    const matches = source.match(new RegExp(`id="${id}"`, "g")) || [];
    assert.equal(matches.length, 1, `${id} should appear once`);
  });
});

test("both graph modes apply the shared Y-axis renderer", () => {
  assert.match(source, /applyManualYAxisControls\(layout, "qpcr"\)/);
  assert.match(source, /applyManualYAxisControls\(tracesAndRows\.layout, "general"\)/);
  assert.match(source, /layout\.yaxis\.dtick = tickStep/);
  assert.match(source, /layout\.yaxis\.tickformat = `\.\$\{decimals\}f`/);
});

test("manual Y-axis settings can be reset independently", () => {
  assert.match(source, /clearYAxisControlValues\("qpcr"\)/);
  assert.match(source, /clearYAxisControlValues\("general"\)/);
  assert.match(source, /id="generalYRangeAutoBtn"/);
  assert.match(source, /id="qpcrYRangeAutoBtn"/);
});
