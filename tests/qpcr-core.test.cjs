const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("../src/qpcr-core.js");

const fixture = `# Normalization method : Endogenous Control = GAPDH
# Reference Sample : CTRL-B1
# Reference Group : CTRL
"Sample Name","Target Name","Mean Equivalent Cq","Mean Adjusted Equivalent Cq",
"CTRL-B1","GAPDH","20","20",
"CTRL-B1","GENE1","22","22",
"CTRL-B2","GAPDH","21","21",
"CTRL-B2","GENE1","23","23",
"CTRL-B3","GAPDH","19","19",
"CTRL-B3","GENE1","21","21",
"TREAT-B1","GAPDH","20","20",
"TREAT-B1","GENE1","21","21",
"TREAT-B2","GAPDH","21","21",
"TREAT-B2","GENE1","22","22",
"TREAT-B3","GAPDH","19","19",
"TREAT-B3","GENE1","20","20",
`;

test("QuantStudio metadata and trailing empty column are parsed", () => {
  const parsed = core.parseDelimited(fixture);
  assert.equal(parsed.rows.length, 12);
  assert.equal(parsed.metadata["Reference Group"], "CTRL");
  assert.deepEqual(Object.keys(parsed.rows[0]), [
    "Sample Name",
    "Target Name",
    "Mean Equivalent Cq",
    "Mean Adjusted Equivalent Cq"
  ]);
});

test("Sample Results and preferred adjusted Cq column are detected", () => {
  const parsed = core.parseDelimited(fixture);
  const detected = core.detectFormat(parsed.rows);
  assert.equal(detected.mode, "quantstudio_sample_results");
  assert.equal(detected.mapping.cycle, "Mean Adjusted Equivalent Cq");
  assert.deepEqual(detected.mapping.availableCycleColumns, [
    "Mean Equivalent Cq",
    "Mean Adjusted Equivalent Cq"
  ]);
});

test("B1/B2/B3 suffix is parsed as biological replicate", () => {
  assert.deepEqual(core.parseBioRepFromSample("PC-SB-B3"), { base: "PC-SB", bioRep: 3 });
  assert.deepEqual(core.parseBioRepFromSample("HELA_BioRep2"), { base: "HELA", bioRep: 2 });
});

test("Sample Results calculate biological-replicate delta-delta Cq", () => {
  const parsed = core.parseDelimited(fixture);
  const result = core.analyzeSampleResults(parsed.rows, {
    referenceGene: "GAPDH",
    calibratorSample: "CTRL",
    cycleColumn: "Mean Adjusted Equivalent Cq",
    expectedBioReps: 3
  });
  assert.equal(result.plotRows.length, 6);
  assert.equal(result.summary.length, 2);
  assert.equal(result.warnings.length, 0);

  const ctrl = result.summary.find((row) => row.Target === "GENE1" && row.Sample === "CTRL");
  const treat = result.summary.find((row) => row.Target === "GENE1" && row.Sample === "TREAT");
  assert.equal(ctrl["Mean RE"], 1);
  assert.equal(treat["Mean RE"], 2);
  assert.equal(ctrl["n BioRep used"], 3);
  assert.equal(treat["SEM RE"], 0);
});

test("Biogroup Results is rejected for replicate-dot calculation", () => {
  const rows = [{ "Bio Group Name": "CTRL", "Target Name": "GENE1", Rq: "1" }];
  assert.throws(
    () => core.analyzeSampleResults(rows, {
      referenceGene: "GAPDH",
      calibratorSample: "CTRL"
    }),
    /Biogroup Results/
  );
});
