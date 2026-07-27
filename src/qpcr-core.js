(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CholabQpcrCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CYCLE_ALIASES = [
    "Ct", "Cq", "CT", "CQ",
    "Mean Ct", "Mean Cq",
    "Mean Equivalent Ct", "Mean Equivalent Cq",
    "Mean Adjusted Equivalent Ct", "Mean Adjusted Equivalent Cq",
    "Adjusted Ct", "Adjusted Cq",
    "Cq Mean", "Ct Mean",
    "Cycle Threshold", "Threshold Cycle", "Quantification Cycle"
  ];
  const CYCLE_PRIORITY = [
    "Mean Adjusted Equivalent Cq", "Mean Adjusted Equivalent Ct",
    "Mean Equivalent Cq", "Mean Equivalent Ct",
    "Cq", "Ct", "Mean Cq", "Mean Ct"
  ];
  const SAMPLE_ALIASES = ["Sample", "Sample Name", "SampleName", "Sample ID", "SampleID"];
  const TARGET_ALIASES = ["Target", "Target Name", "TargetName", "Assay", "Gene"];
  const WELL_ALIASES = ["Well", "Well Position", "WellPosition", "Position", "Well ID", "WellID"];
  const BIOGROUP_ALIASES = ["Bio Group Name", "Biogroup Name", "BioGroup Name"];

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[µμ]/g, "u")
      .replace(/[Δ∆]/g, "delta")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function orderedUnique(values) {
    const seen = new Set();
    const out = [];
    values.forEach((value) => {
      const key = clean(value);
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    });
    return out;
  }

  function getColumns(rows) {
    const columns = [];
    const seen = new Set();
    rows.forEach((row) => {
      Object.keys(row || {}).forEach((column) => {
        if (!seen.has(column)) {
          seen.add(column);
          columns.push(column);
        }
      });
    });
    return columns;
  }

  function findColumn(columns, aliases) {
    const lookup = new Map(columns.map((column) => [normalize(column), column]));
    for (const alias of aliases) {
      const exact = lookup.get(normalize(alias));
      if (exact) return exact;
    }
    return "";
  }

  function availableCycleColumns(columns) {
    const lookup = new Map(columns.map((column) => [normalize(column), column]));
    const hits = [];
    CYCLE_ALIASES.forEach((alias) => {
      const column = lookup.get(normalize(alias));
      if (column && !hits.includes(column)) hits.push(column);
    });
    return hits;
  }

  function selectCycleColumn(columns, requested = "auto") {
    const available = availableCycleColumns(columns);
    if (!available.length) {
      throw new Error(
        "Ct/Cq 값 컬럼을 찾지 못했습니다. 지원 예: Ct, Cq, Mean Equivalent Cq, Mean Adjusted Equivalent Cq."
      );
    }
    if (requested && normalize(requested) !== "auto") {
      const hit = available.find((column) => normalize(column) === normalize(requested));
      if (!hit) throw new Error(`선택한 cycle 컬럼 '${requested}'을 찾지 못했습니다.`);
      return hit;
    }
    for (const preferred of CYCLE_PRIORITY) {
      const hit = available.find((column) => normalize(column) === normalize(preferred));
      if (hit) return hit;
    }
    return available[0];
  }

  function detectColumns(rows, requestedCycle = "auto") {
    const columns = getColumns(rows);
    const cycles = availableCycleColumns(columns);
    let cycle = "";
    if (cycles.length) cycle = selectCycleColumn(columns, requestedCycle);
    return {
      columns,
      well: findColumn(columns, WELL_ALIASES),
      target: findColumn(columns, TARGET_ALIASES),
      sample: findColumn(columns, SAMPLE_ALIASES),
      biogroup: findColumn(columns, BIOGROUP_ALIASES),
      rq: findColumn(columns, ["Rq", "RQ", "Relative Quantity", "Relative Expression"]),
      rqMin: findColumn(columns, ["Rq Min", "RQ Min", "Relative Quantity Min"]),
      rqMax: findColumn(columns, ["Rq Max", "RQ Max", "Relative Quantity Max"]),
      correctedPValue: findColumn(columns, ["Corrected P-Value", "Adjusted P-Value", "Adjusted P Value"]),
      cycle,
      availableCycleColumns: cycles
    };
  }

  function detectFormat(rows, requestedCycle = "auto") {
    const mapping = detectColumns(rows, requestedCycle);
    const hasSampleName = Boolean(findColumn(mapping.columns, ["Sample Name"]));
    const hasTargetName = Boolean(findColumn(mapping.columns, ["Target Name"]));
    if (mapping.biogroup && hasTargetName) return { mode: "quantstudio_biogroup_results", mapping };
    if (hasSampleName && hasTargetName && mapping.cycle) return { mode: "quantstudio_sample_results", mapping };
    if (mapping.sample && mapping.target && mapping.cycle) return { mode: "raw_well_or_tidy", mapping };
    return { mode: "unknown", mapping };
  }

  function splitDelimitedLine(line, delimiter) {
    if (delimiter === "\t") return line.split("\t");
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        out.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    out.push(current);
    return out;
  }

  function detectDelimiter(lines) {
    const candidates = ["\t", ",", ";"];
    let best = ",";
    let bestScore = -Infinity;
    candidates.forEach((delimiter) => {
      const counts = lines.slice(0, 12).map((line) => splitDelimitedLine(line, delimiter).length);
      const useful = counts.filter((count) => count > 1);
      if (!useful.length) return;
      const average = useful.reduce((sum, count) => sum + count, 0) / useful.length;
      const spread = useful.reduce((sum, count) => sum + Math.abs(count - average), 0) / useful.length;
      const score = average * useful.length - spread * 2;
      if (score > bestScore) {
        best = delimiter;
        bestScore = score;
      }
    });
    return best;
  }

  function uniqueHeaders(values) {
    const seen = new Map();
    return values.map((value, index) => {
      const base = clean(value).replace(/^\ufeff/, "") || `Column ${index + 1}`;
      const key = normalize(base) || `column${index + 1}`;
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      return count === 1 ? base : `${base}_${count}`;
    });
  }

  function parseDelimited(text) {
    const metadata = {};
    const dataLines = [];
    String(text ?? "").replace(/\r/g, "").split("\n").forEach((rawLine) => {
      const line = rawLine.replace(/^\ufeff/, "");
      if (!line.trim()) return;
      if (line.trimStart().startsWith("#")) {
        const body = line.trim().replace(/^#+\s*/, "");
        const separator = body.indexOf(":");
        if (separator >= 0) metadata[body.slice(0, separator).trim()] = body.slice(separator + 1).trim();
        return;
      }
      dataLines.push(line);
    });
    if (!dataLines.length) return { rows: [], metadata, delimiter: "," };
    const delimiter = detectDelimiter(dataLines);
    const matrix = dataLines.map((line) => splitDelimitedLine(line, delimiter));
    while (matrix.some((row) => row.length) && matrix.every((row) => clean(row[row.length - 1]) === "")) {
      matrix.forEach((row) => row.pop());
    }
    const headers = uniqueHeaders(matrix[0] || []);
    const rows = matrix.slice(1).map((cells) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = clean(cells[index]);
      });
      return row;
    }).filter((row) => Object.values(row).some((value) => clean(value) !== ""));
    return { rows, metadata, delimiter };
  }

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    let text = clean(value)
      .replace(/\u2212/g, "-")
      .replace(/[<>≤≥≈~]/g, "")
      .replace(/\s+/g, "");
    if (!text || /^[-–—]$/.test(text) || /undetermined|undet|n\/a|^na$/i.test(text)) return NaN;
    text = text.replace(/%$/, "");
    if (/^-?\d+,\d+$/.test(text) && !text.includes(".")) text = text.replace(",", ".");
    else text = text.replace(/,/g, "");
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }

  function parseBioRepFromSample(sample) {
    const value = clean(sample);
    const patterns = [
      /^(.+?)[-_ ](?:B|BioRep|Bio|BR|BRep|Rep|R)(\d+)$/i,
      /^(.+?)[-_ ](?:B|BioRep|Bio|BR|BRep|Rep|R)[-_ ](\d+)$/i
    ];
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) return { base: clean(match[1]).replace(/[-_ ]+$/, ""), bioRep: Number(match[2]) };
    }
    return { base: value, bioRep: NaN };
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
  }

  function standardDeviation(values) {
    if (values.length < 2) return NaN;
    const average = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
  }

  function round(value, digits = 6) {
    if (!Number.isFinite(value)) return "";
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function analyzeSampleResults(rows, options) {
    const {
      referenceGene,
      calibratorSample,
      cycleColumn = "auto",
      excludeSamples = [],
      expectedBioReps = 3
    } = options || {};
    const detected = detectFormat(rows, cycleColumn);
    if (detected.mode === "quantstudio_biogroup_results") {
      throw new Error(
        "Biogroup Results는 biological replicate가 이미 합쳐진 요약 파일입니다. B1/B2/B3 점 계산에는 Sample Results CSV를 사용하세요."
      );
    }
    if (detected.mode !== "quantstudio_sample_results") {
      throw new Error(`QuantStudio Sample Results 형식이 아닙니다. 감지 형식: ${detected.mode}`);
    }
    const mapping = detected.mapping;
    const excluded = new Set(excludeSamples.map(clean));
    const standardized = rows.map((row, index) => {
      const sample = clean(row[mapping.sample]);
      const parsed = parseBioRepFromSample(sample);
      return {
        sourceRow: index + 1,
        sample,
        sampleBase: parsed.base,
        bioRep: parsed.bioRep,
        target: clean(row[mapping.target]),
        cycle: parseNumber(row[mapping.cycle])
      };
    }).filter((row) => row.sample && row.target);

    const invalidReplicates = orderedUnique(
      standardized.filter((row) => !Number.isFinite(row.bioRep)).map((row) => row.sample)
    );
    if (invalidReplicates.length) {
      throw new Error(`Sample Name에서 BioRep 번호(B1/B2/B3)를 읽지 못했습니다: ${invalidReplicates.slice(0, 12).join(", ")}`);
    }

    const allTargets = orderedUnique(standardized.map((row) => row.target));
    const allSamples = orderedUnique(standardized.map((row) => row.sampleBase));
    if (!referenceGene || !allTargets.includes(referenceGene)) {
      throw new Error(`Reference gene '${referenceGene || "(미선택)"}'가 Target 목록에 없습니다.`);
    }
    const samples = allSamples.filter((sample) => !excluded.has(sample));
    if (!calibratorSample || !samples.includes(calibratorSample)) {
      throw new Error(`Calibrator '${calibratorSample || "(미선택)"}'가 분석 sample 목록에 없습니다.`);
    }
    const targets = allTargets.filter((target) => target !== referenceGene);
    if (!targets.length) throw new Error("Reference gene 외 target gene이 필요합니다.");

    const warnings = [];
    const grouped = new Map();
    standardized.filter((row) => samples.includes(row.sampleBase)).forEach((row) => {
      const key = `${row.sampleBase}|||${row.bioRep}|||${row.target}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    const cycleLookup = new Map();
    grouped.forEach((groupRows, key) => {
      const values = groupRows.map((row) => row.cycle).filter(Number.isFinite);
      if (groupRows.length > 1) {
        const [sample, bioRep, target] = key.split("|||");
        warnings.push({
          Level: "duplicate Sample Results",
          Sample: sample,
          Target: target,
          BioRep: Number(bioRep),
          Issue: `${groupRows.length} rows detected; finite cycle values were averaged`
        });
      }
      if (values.length) cycleLookup.set(key, mean(values));
    });

    samples.forEach((sample) => {
      [referenceGene, ...targets].forEach((target) => {
        const observed = orderedUnique(
          standardized
            .filter((row) => row.sampleBase === sample && row.target === target && Number.isFinite(row.cycle))
            .map((row) => row.bioRep)
        ).map(Number).sort((a, b) => a - b);
        if (expectedBioReps && observed.length !== expectedBioReps) {
          warnings.push({
            Level: "bio replicate count",
            Sample: sample,
            Target: target,
            BioRep: "",
            Issue: `expected ${expectedBioReps}, observed ${observed.length}: ${observed.join(",") || "none"}`
          });
        }
      });
    });

    const dCtLookup = new Map();
    const pairedRows = [];
    targets.forEach((target) => {
      samples.forEach((sample) => {
        const bioReps = orderedUnique(
          standardized.filter((row) => row.sampleBase === sample).map((row) => row.bioRep)
        ).map(Number).sort((a, b) => a - b);
        bioReps.forEach((bioRep) => {
          const targetCycle = cycleLookup.get(`${sample}|||${bioRep}|||${target}`);
          const referenceCycle = cycleLookup.get(`${sample}|||${bioRep}|||${referenceGene}`);
          if (!Number.isFinite(targetCycle) || !Number.isFinite(referenceCycle)) {
            warnings.push({
              Level: "dCq pairing",
              Sample: sample,
              Target: target,
              BioRep: bioRep,
              Issue: !Number.isFinite(referenceCycle)
                ? `missing ${referenceGene} cycle value`
                : "missing target cycle value"
            });
            return;
          }
          const dCt = targetCycle - referenceCycle;
          dCtLookup.set(`${target}|||${sample}|||${bioRep}`, dCt);
          pairedRows.push({ target, sample, bioRep, targetCycle, referenceCycle, dCt });
        });
      });
    });

    const plotRows = [];
    const calculations = [];
    targets.forEach((target) => {
      const calibratorDCt = pairedRows
        .filter((row) => row.target === target && row.sample === calibratorSample)
        .map((row) => row.dCt);
      if (!calibratorDCt.length) throw new Error(`Calibrator '${calibratorSample}'의 '${target}' dCq가 없습니다.`);
      const calibratorMean = mean(calibratorDCt);
      pairedRows.filter((row) => row.target === target).forEach((row) => {
        const ddCt = row.dCt - calibratorMean;
        const relativeExpression = 2 ** (-ddCt);
        plotRows.push({
          Target: row.target,
          Sample: row.sample,
          Replicate: `BioRep${row.bioRep}`,
          BioRep: row.bioRep,
          RE: relativeExpression
        });
        calculations.push({
          Target: row.target,
          Sample: row.sample,
          BioRep: row.bioRep,
          "Target cycle column": mapping.cycle,
          "Target cycle": round(row.targetCycle),
          "Reference gene": referenceGene,
          "Reference cycle": round(row.referenceCycle),
          dCq: round(row.dCt),
          [`${calibratorSample} mean dCq`]: round(calibratorMean),
          ddCq: round(ddCt),
          RE: round(relativeExpression)
        });
      });
    });

    const summary = [];
    targets.forEach((target) => {
      samples.forEach((sample) => {
        const values = plotRows
          .filter((row) => row.Target === target && row.Sample === sample)
          .map((row) => row.RE)
          .filter(Number.isFinite);
        if (!values.length) return;
        const sd = standardDeviation(values);
        summary.push({
          Target: target,
          Sample: sample,
          "n BioRep used": values.length,
          "Mean RE": round(mean(values)),
          "SD RE": Number.isFinite(sd) ? round(sd) : "",
          "SEM RE": Number.isFinite(sd) ? round(sd / Math.sqrt(values.length)) : "",
          "RE values": values.map((value) => round(value)).join(", ")
        });
      });
    });

    return {
      mode: "BioRep",
      inputMode: detected.mode,
      cycleColumn: mapping.cycle,
      targets,
      samples,
      plotRows,
      summary,
      calcs: calculations,
      warnings,
      notes: [
        "Input: QuantStudio Sample Results",
        `Cycle column: ${mapping.cycle}`,
        `Reference: ${referenceGene}`,
        `Calibrator group: ${calibratorSample}`,
        "각 B1/B2/B3 row는 biological replicate이며 technical replicate는 이미 cycle mean에 요약되어 있습니다.",
        "2^-ΔΔCq는 target/reference assay의 증폭 효율이 충분히 유사하다는 가정의 비교 Cq 계산입니다. 효율 차이가 크면 efficiency-corrected 방법을 사용하세요."
      ]
    };
  }

  function analyzeBiogroupResults(rows, options) {
    const {
      excludeSamples = [],
      confidenceLevel = ""
    } = options || {};
    const detected = detectFormat(rows, "auto");
    if (detected.mode !== "quantstudio_biogroup_results") {
      throw new Error(`QuantStudio Biogroup Results 형식이 아닙니다. 감지 형식: ${detected.mode}`);
    }
    const mapping = detected.mapping;
    if (!mapping.rq) {
      throw new Error("Biogroup Results에서 Rq 컬럼을 찾지 못했습니다.");
    }
    const excluded = new Set(excludeSamples.map(clean));
    const warnings = [];
    const calculations = rows.map((row, index) => ({
      sourceRow: index + 1,
      sample: clean(row[mapping.biogroup]),
      target: clean(row[mapping.target]),
      rq: parseNumber(row[mapping.rq]),
      rqMin: mapping.rqMin ? parseNumber(row[mapping.rqMin]) : NaN,
      rqMax: mapping.rqMax ? parseNumber(row[mapping.rqMax]) : NaN,
      correctedPValue: mapping.correctedPValue ? parseNumber(row[mapping.correctedPValue]) : NaN
    })).filter((row) => row.sample && row.target && !excluded.has(row.sample));

    const finiteRows = calculations.filter((row) => Number.isFinite(row.rq));
    if (!finiteRows.length) throw new Error("Biogroup Results의 Rq 컬럼에 그래프로 그릴 숫자 값이 없습니다.");
    const duplicates = new Map();
    finiteRows.forEach((row) => {
      const key = `${row.sample}|||${row.target}`;
      duplicates.set(key, (duplicates.get(key) || 0) + 1);
    });
    duplicates.forEach((count, key) => {
      if (count < 2) return;
      const [sample, target] = key.split("|||");
      warnings.push({
        Level: "duplicate Biogroup Results",
        Sample: sample,
        Target: target,
        Issue: `${count} aggregate Rq rows detected`
      });
    });

    const targets = orderedUnique(finiteRows.map((row) => row.target));
    const samples = orderedUnique(finiteRows.map((row) => row.sample));
    const plotRows = finiteRows.map((row) => ({
      Target: row.target,
      Sample: row.sample,
      Replicate: "QuantStudio aggregate",
      RE: row.rq,
      "Rq Min": Number.isFinite(row.rqMin) ? row.rqMin : "",
      "Rq Max": Number.isFinite(row.rqMax) ? row.rqMax : "",
      "Corrected P-Value": Number.isFinite(row.correctedPValue) ? row.correctedPValue : ""
    }));
    const summary = plotRows.map((row) => ({
      Target: row.Target,
      Sample: row.Sample,
      "n aggregate": 1,
      "Mean RE": round(row.RE),
      "Rq Min": Number.isFinite(row["Rq Min"]) ? round(row["Rq Min"]) : "",
      "Rq Max": Number.isFinite(row["Rq Max"]) ? round(row["Rq Max"]) : "",
      "Corrected P-Value": Number.isFinite(row["Corrected P-Value"])
        ? round(row["Corrected P-Value"])
        : ""
    }));
    const calcs = calculations.map((row) => ({
      "Source row": row.sourceRow,
      "Bio Group": row.sample,
      Target: row.target,
      Rq: Number.isFinite(row.rq) ? round(row.rq) : "",
      "Rq Min": Number.isFinite(row.rqMin) ? round(row.rqMin) : "",
      "Rq Max": Number.isFinite(row.rqMax) ? round(row.rqMax) : "",
      "Corrected P-Value": Number.isFinite(row.correctedPValue) ? round(row.correctedPValue) : ""
    }));
    const intervalLabel = confidenceLevel ? `${confidenceLevel} 신뢰구간` : "신뢰구간";
    return {
      mode: "Biogroup aggregate",
      inputMode: detected.mode,
      targets,
      samples,
      plotRows,
      summary,
      calcs,
      warnings,
      notes: [
        "Input: QuantStudio Biogroup Results",
        "QuantStudio가 계산한 Rq 값을 그대로 사용하며 2^-ΔΔCq를 다시 계산하지 않습니다.",
        `Rq Min/Rq Max는 export에 포함된 ${intervalLabel}으로 표시합니다.`,
        "Biological replicate가 이미 합쳐진 aggregate이므로 개별 BioRep 점과 SD/SEM은 만들 수 없습니다. 반복점이 필요하면 Sample Results를 사용하세요."
      ]
    };
  }

  return {
    CYCLE_ALIASES,
    CYCLE_PRIORITY,
    normalize,
    clean,
    getColumns,
    findColumn,
    availableCycleColumns,
    selectCycleColumn,
    detectColumns,
    detectFormat,
    parseDelimited,
    parseNumber,
    parseBioRepFromSample,
    analyzeSampleResults,
    analyzeBiogroupResults
  };
});
