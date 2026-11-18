/**
 * CivicPulse Research Paper Benchmark: Duplicate Detection Evaluation
 * Compares:
 *   1. Baseline A: Pure Lexical / Jaccard Overlap
 *   2. Baseline B: Pure Spatial Proximity (within 100m)
 *   3. Baseline C: Pure Vector Cosine Similarity
 *   4. Proposed:   CivicPulse Multi-Modal Hybrid Policy
 */

const fs = require("fs");
const path = require("path");
const { evaluateDuplicate } = require("../src/modules/intelligence/understand/duplicate.policy");

// -------------------------------------------------------------
// 1. Curated Benchmark Dataset (Synthetic Municipal Test Set)
// Each pair has ground truth: is_duplicate (true / false)
// -------------------------------------------------------------
const testDataset = [
  // --- TRUE DUPLICATES (Same issue reported with different wording nearby) ---
  {
    id: "TD-01",
    textA: "Huge pothole near Anna Nagar 2nd avenue signal, dangerous for bikes",
    textB: "Deep road crater at Anna Nagar second avenue junction causing traffic",
    categoryA: "ROAD", categoryB: "ROAD",
    distanceMeters: 25, daysApart: 1,
    vectorSim: 0.88,
    is_duplicate: true
  },
  {
    id: "TD-02",
    textA: "Water pipe broken in front of block 4, clean drinking water wasting",
    textB: "Severe water leakage from municipal pipeline block 4 street",
    categoryA: "WATER", categoryB: "WATER",
    distanceMeters: 10, daysApart: 2,
    vectorSim: 0.91,
    is_duplicate: true
  },
  {
    id: "TD-03",
    textA: "Streetlight pole #42 completely dark for 3 days",
    textB: "Lamp post 42 not glowing at night, very dark and unsafe",
    categoryA: "ELECTRICITY", categoryB: "ELECTRICITY",
    distanceMeters: 5, daysApart: 0.5,
    vectorSim: 0.86,
    is_duplicate: true
  },
  {
    id: "TD-04",
    textA: "Garbage bin overflowing near bus stop, stray dogs scattering trash",
    textB: "Waste not cleared from bus stand trash bin, foul smell",
    categoryA: "GARBAGE", categoryB: "GARBAGE",
    distanceMeters: 40, daysApart: 3,
    vectorSim: 0.83,
    is_duplicate: true
  },
  {
    id: "TD-05",
    textA: "Stormwater drain cover missing, open hole on pedestrian walkway",
    textB: "Drainage slab broken open footpath pedestrian danger",
    categoryA: "DRAINAGE", categoryB: "DRAINAGE",
    distanceMeters: 15, daysApart: 1,
    vectorSim: 0.84,
    is_duplicate: true
  },
  {
    id: "TD-06",
    textA: "Traffic light stuck on blinking amber at crossroad",
    textB: "Signal malfunctioning flashing yellow at intersection",
    categoryA: "TRAFFIC", categoryB: "TRAFFIC",
    distanceMeters: 30, daysApart: 0.2,
    vectorSim: 0.85,
    is_duplicate: true
  },
  {
    id: "TD-07",
    textA: "Open manhole on 5th main road near pharmacy",
    textB: "Sewer lid displaced 5th main street outside medical shop",
    categoryA: "DRAINAGE", categoryB: "DRAINAGE",
    distanceMeters: 20, daysApart: 1,
    vectorSim: 0.82,
    is_duplicate: true
  },
  {
    id: "TD-08",
    textA: "Low hanging electric wire touching tree branch",
    textB: "Power cable sagging into trees sparking in wind",
    categoryA: "ELECTRICITY", categoryB: "ELECTRICITY",
    distanceMeters: 15, daysApart: 0.5,
    vectorSim: 0.87,
    is_duplicate: true
  },

  // --- HARD NEGATIVES: Same Location, Different Issues (Spatial alone fails here) ---
  {
    id: "HN-01",
    textA: "Pothole on 100ft road near bank",
    textB: "Streetlight not working on 100ft road near bank",
    categoryA: "ROAD", categoryB: "ELECTRICITY",
    distanceMeters: 15, daysApart: 1,
    vectorSim: 0.42,
    is_duplicate: false
  },
  {
    id: "HN-02",
    textA: "Garbage dumped outside school gate",
    textB: "Waterlogged street outside school gate",
    categoryA: "GARBAGE", categoryB: "DRAINAGE",
    distanceMeters: 20, daysApart: 2,
    vectorSim: 0.38,
    is_duplicate: false
  },
  {
    id: "HN-03",
    textA: "Broken park bench at central ground",
    textB: "Fallen tree branch blocking walkway at central ground",
    categoryA: "PARKS", categoryB: "PARKS",
    distanceMeters: 35, daysApart: 1,
    vectorSim: 0.51,
    is_duplicate: false
  },
  {
    id: "HN-04",
    textA: "Sewage overflow behind commercial complex",
    textB: "Illegal parking blocking delivery bay behind commercial complex",
    categoryA: "DRAINAGE", categoryB: "TRAFFIC",
    distanceMeters: 10, daysApart: 0.5,
    vectorSim: 0.32,
    is_duplicate: false
  },

  // --- HARD NEGATIVES: Similar Phrasing, Completely Different Locations (Lexical/Vector alone fails) ---
  {
    id: "HN-05",
    textA: "Huge pothole near Anna Nagar 2nd avenue signal",
    textB: "Huge pothole near T Nagar bus terminus signal",
    categoryA: "ROAD", categoryB: "ROAD",
    distanceMeters: 8500, daysApart: 1, // 8.5 km apart!
    vectorSim: 0.92,
    is_duplicate: false
  },
  {
    id: "HN-06",
    textA: "Water pipe burst flooding the residential street",
    textB: "Water pipe burst flooding the main market area",
    categoryA: "WATER", categoryB: "WATER",
    distanceMeters: 12000, daysApart: 2, // 12 km apart!
    vectorSim: 0.89,
    is_duplicate: false
  },
  {
    id: "HN-07",
    textA: "Garbage bin overflowing foul smell everywhere",
    textB: "Garbage bin overflowing foul smell everywhere",
    categoryA: "GARBAGE", categoryB: "GARBAGE",
    distanceMeters: 6200, daysApart: 0.5, // identical text, different zone
    vectorSim: 0.99,
    is_duplicate: false
  },

  // --- TEMPORAL NEGATIVES: Same place & issue, but 1 year apart (Repaired in between) ---
  {
    id: "HN-08",
    textA: "Pothole filled with rainwater near corner store",
    textB: "Pothole filled with rainwater near corner store",
    categoryA: "ROAD", categoryB: "ROAD",
    distanceMeters: 20, daysApart: 380, // > 1 year
    vectorSim: 0.95,
    is_duplicate: false
  }
];

// -------------------------------------------------------------
// Helper: Lexical Jaccard Word Similarity
// -------------------------------------------------------------
function computeJaccard(strA, strB) {
  const tokenize = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean));
  const setA = tokenize(strA);
  const setB = tokenize(strB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// -------------------------------------------------------------
// Model Implementations
// -------------------------------------------------------------
const models = {
  "1. Pure Lexical (Jaccard > 0.40)": (item) => {
    const jaccard = computeJaccard(item.textA, item.textB);
    return jaccard >= 0.40;
  },

  "2. Pure Spatial (Distance <= 100m)": (item) => {
    return item.distanceMeters <= 100;
  },

  "3. Pure Vector (Cosine Sim >= 0.85)": (item) => {
    return item.vectorSim >= 0.85;
  },

  "4. CivicPulse Hybrid (Multi-Modal Policy)": (item) => {
    const res = evaluateDuplicate({
      similarity: item.vectorSim,
      distanceMeters: item.distanceMeters,
      daysApart: item.daysApart,
      categoryMatch: item.categoryA === item.categoryB,
      timeWindowDays: 90
    });
    return res.isDuplicate;
  }
};

// -------------------------------------------------------------
// Metric Evaluator (TP, FP, TN, FN -> Precision, Recall, F1)
// -------------------------------------------------------------
function evaluateModel(modelFn) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const item of testDataset) {
    const pred = modelFn(item);
    const actual = item.is_duplicate;

    if (pred && actual) tp++;
    else if (pred && !actual) fp++;
    else if (!pred && !actual) tn++;
    else if (!pred && actual) fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / testDataset.length;

  return { tp, fp, tn, fn, precision, recall, f1, accuracy };
}

// -------------------------------------------------------------
// Main Benchmark Runner
// -------------------------------------------------------------
function run() {
  console.log("================================================================================");
  console.log("             CIVICPULSE RESEARCH BENCHMARK: DUPLICATE DETECTION                 ");
  console.log("================================================================================");
  console.log(`Total Evaluation Pairs: ${testDataset.length}`);
  console.log(`- True Duplicates:      ${testDataset.filter(d => d.is_duplicate).length}`);
  console.log(`- Hard Distractors:     ${testDataset.filter(d => !d.is_duplicate).length}`);
  console.log("--------------------------------------------------------------------------------\n");

  const results = [];

  for (const [name, modelFn] of Object.entries(models)) {
    const metrics = evaluateModel(modelFn);
    results.push({
      Model: name,
      TP: metrics.tp,
      FP: metrics.fp,
      TN: metrics.tn,
      FN: metrics.fn,
      "Precision (%)": (metrics.precision * 100).toFixed(1) + "%",
      "Recall (%)": (metrics.recall * 100).toFixed(1) + "%",
      "F1-Score": metrics.f1.toFixed(3),
      "Accuracy (%)": (metrics.accuracy * 100).toFixed(1) + "%"
    });
  }

  console.table(results);

  // Export to CSV for plotting / paper inclusion
  const csvRows = [
    "Model,TP,FP,TN,FN,Precision,Recall,F1_Score,Accuracy",
    ...results.map(r => `"${r.Model}",${r.TP},${r.FP},${r.TN},${r.FN},${r["Precision (%)"].replace("%","")},${r["Recall (%)"].replace("%","")},${r["F1-Score"]},${r["Accuracy (%)"].replace("%","")}`)
  ];

  const outputPath = path.join(__dirname, "benchmark_results.csv");
  fs.writeFileSync(outputPath, csvRows.join("\n"), "utf-8");
  console.log(`\n[+] Results successfully exported to: ${outputPath}`);
  console.log("[+] You can directly copy the table above into Section 5 of your paper!\n");
}

run();
