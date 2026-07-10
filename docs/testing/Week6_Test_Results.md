# Week 6 Test Results Document — Smart IV Desktop Application

This document summarizes the execution and results of the automated unit tests for the Smart IV desktop application.

---

## Testing Environment & Configuration

* **Testing Framework**: [Vitest](https://vitest.dev/) (v4.1.6)
* **Test Environment**: `jsdom` (in-browser emulation for React components and Zustand state lifecycle)
* **Test Command Used**: `npx vitest run`

---

## Test Execution Summary

### Test Count Details
* **New Week 6 tests**: 17 passed, 0 failed
* **Existing repository tests**: 33 passed, 0 failed
* **Combined suite**: 50 passed, 0 failed

### Test File Breakdown
| Test File | Focus | Tests Written | Passing | Failing |
| :--- | :--- | :---: | :---: | :---: |
| **`upsertBed.test.ts`** | Upserting and merging telemetry (new tests) | **8** | **8** | **0** |
| **`setBedMeta.test.ts`** | Updating bed metadata (new tests) | **3** | **3** | **0** |
| **`addAlert.test.ts`** | Appending alerts and checking boundary limits (new tests) | **3** | **3** | **0** |
| **`resolveAlert.test.ts`** | Acknowledging alerts (new tests) | **3** | **3** | **0** |
| `store.test.ts` | Basic store actions (existing tests) | **8** | **8** | **0** |
| `WardGrid.test.tsx` | Component rendering of bed grid (existing tests) | **3** | **3** | **0** |
| `BedCard.test.tsx` | Component rendering of bed card metrics (existing tests) | **3** | **3** | **0** |
| `BedDetailModel.test.tsx` | Component rendering of detailed modal (existing tests) | **2** | **2** | **0** |
| `App.test.tsx` | Integration rendering and route navigation (existing tests) | **17** | **17** | **0** |
| **Total** | | **50** | **50** | **0** |

---

## Mocked Dependencies

The new Week 6 test files use the following mocks to maintain determinism:
1. **`Date.now`**: Mocked/spied on to return a fixed timestamp (`1717171717171`) for verifying the `lastSeen` telemetry calculation.
2. **`Date.prototype.toISOString`**: Mocked/spied on to return a predictable string (`"2026-07-10T05:00:00.000Z"`) when validating alert resolution times.

---

## Refactoring Report

* **Production Code Refactoring**: **None**.
  * All tests were implemented by importing and interacting with the exported Zustand store actions directly. No modifications to production code were made, satisfying project constraints.

---

## Limitations

The automated tests are subject to the following limitations:
1. **Missing Telemetry Validation**: Incoming telemetry values are not validated by the store before being saved in the state. If invalid values (e.g. negative flow rates or battery values) are sent, they are stored as-is.
2. **Duplicate-Alert Handling**: The Zustand alert store does not perform alert deduplication. Deduplication is handled by the Rust backend engine, which was not tested in this client-side test suite.
3. **Rust Backend Not Tested**: Rust backend code and Tauri IPC endpoints (e.g., SQLite DB access, serial drivers) were excluded from scope.
4. **SQLite Persistence Not Tested**: Persistence of sessions, telemetry, and alerts database records is not verified by this memory-bound test suite.
5. **Serial, MQTT, and AWS Integrations**: Hardware components and real cloud integrations were not tested in the browser.

---

## Exact Final Test Runner Output

```text
 RUN  v4.1.6 F:/Academics/Computer-Engineering/Semester-5/3YP/webpage/e21-3yp-Smart-IV/Desktop-App-Rust

 ✓ src/tests/addAlert.test.ts (3 tests) 11ms
 ✓ src/tests/resolveAlert.test.ts (3 tests) 13ms
 ✓ src/tests/setBedMeta.test.ts (3 tests) 10ms
 ✓ src/tests/upsertBed.test.ts (8 tests) 15ms
 ✓ src/tests/store.test.ts (8 tests) 13ms
 ✓ src/tests/WardGrid.test.tsx (3 tests) 235ms
 ✓ src/tests/BedCard.test.tsx (3 tests) 329ms
 ✓ src/tests/BedDetailModel.test.tsx (2 tests) 354ms
 ✓ src/tests/App.test.tsx (17 tests) 2428ms

 Test Files  9 passed (9)
      Tests  50 passed (50)
   Start at  09:05:43
   Duration  131.27s (transform 1.02s, setup 0ms, import 336.29s, tests 3.43s, environment 211.97s)
```
