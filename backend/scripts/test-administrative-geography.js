require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const pool = require("../src/config/database");
const {
  resolveAdministrativeArea,
} = require("../src/modules/intelligence/spatial/administrative-geography.service");

async function main() {
  const testCases = [
    {
      name: "Chennai — known complaint coordinate",
      latitude: 13.0827,
      longitude: 80.2707,
      expectedWardCode: "GCC:WARD:058",
      expectedZoneCode: "GCC:ZONE:05",
    },
    {
      name: "Outside Chennai — Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
      expectedWardCode: null,
      expectedZoneCode: null,
    },
    {
      name: "Outside Chennai — Vijayawada",
      latitude: 16.5062,
      longitude: 80.648,
      expectedWardCode: null,
      expectedZoneCode: null,
    },
  ];

  let failures = 0;

  try {
    for (const testCase of testCases) {
      const result = await resolveAdministrativeArea(testCase);

      const passed =
        (result?.wardCode ?? null) === testCase.expectedWardCode &&
        (result?.zoneCode ?? null) === testCase.expectedZoneCode;

      if (!passed) failures += 1;

      console.log(`\n${passed ? "PASS" : "FAIL"}: ${testCase.name}`);
      console.log(result || "No administrative area resolved");

      if (!passed) {
        console.error("Expected:", {
          wardCode: testCase.expectedWardCode,
          zoneCode: testCase.expectedZoneCode,
        });
      }
    }

    if (failures > 0) {
      throw new Error(`${failures} geography test(s) failed`);
    }

    console.log("\nAll administrative geography tests passed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
