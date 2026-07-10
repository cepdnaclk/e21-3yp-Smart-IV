# Week 6 Test Design Document — Smart IV Desktop Application

This document outlines the test design for the core business logic and state management functions of the Smart IV desktop application.

---

## Selected Functions

### 1. `upsertBed`
* **Source File**: [store/index.ts](file:///f:/Academics/Computer-Engineering/Semester-5/3YP/webpage/e21-3yp-Smart-IV/Desktop-App-Rust/src/store/index.ts)
* **Purpose**: A state-transformation function that registers a new bed or updates telemetry details for an existing bed while retaining any previously set metadata (patient name and ward) if omitted in the packet.
* **Why it is Critical**: Serves as the central data ingestion pipeline for live telemetry packets. Any issue here prevents real-time IV drip updates, battery status reporting, and connection tracking on the nurse's dashboard.
* **Input Parameters**:
  * `packet`: A `BedPacket` object with an optional `patientName?: string` and `ward?: string`.
* **Expected Output or State Change**:
  * The `beds` record in the store under `packet.bedId` is created or merged.
  * `lastSeen` is set to the current time (`Date.now()`).
  * `isConnected` is set to `false` if `status` is `'CONN_LOST'` or `'OFFLINE'`, and `true` otherwise.
  * If `patientName` or `ward` is omitted:
    * For a new bed: defaults to `"Patient <bedId>"` and `"Ward A"`.
    * For an existing bed: retains the existing `patientName` and `ward` values in state.
* **Equivalence Partitions**:
  * **Bed Existence**:
    * New bed (ID not in store).
    * Existing bed (ID already in store).
  * **Telemetry Status**:
    * Active status (`'STABLE'`, `'BLOCKAGE'`, `'EMPTY_BAG'`) -> `isConnected: true`.
    * Inactive/Disconnected status (`'CONN_LOST'`, `'OFFLINE'`) -> `isConnected: false`.
  * **Metadata Presence**:
    * Metadata provided in packet.
    * Metadata omitted in packet (triggers defaults for new bed, preservation for existing bed).
* **Boundary-Value Cases**:
  * Battery: `0` (lowest valid), `100` (highest valid).
* **Negative & Error Cases**:
  * *Missing Input Validation*: Currently, the store does not perform input validation on incoming telemetry values. Negative values for battery percentage, flow rate, or remaining volume are accepted into the store's state as-is. This is a known gap documented in the tests.
* **External Dependencies**: Zustand store engine.
* **Dependencies to Mock/Stub**: `Date.now` (to return a fixed timestamp for verification).
* **Planned Test Cases**:
  * `adds new bed with default metadata and sets isConnected=true for STABLE status`
  * `sets isConnected=false when status is CONN_LOST`
  * `sets isConnected=false when status is OFFLINE`
  * `updates existing bed telemetry but preserves existing patientName and ward`
  * `overrides patientName and ward if explicitly provided`
  * `updates lastSeen to the mocked current time`
  * `handles boundary values for battery (0 and 100)`
  * `stores raw invalid telemetry values because validation is not implemented in the store`

---

### 2. `setBedMeta`
* **Source File**: [store/index.ts](file:///f:/Academics/Computer-Engineering/Semester-5/3YP/webpage/e21-3yp-Smart-IV/Desktop-App-Rust/src/store/index.ts)
* **Purpose**: Updates the custom metadata (patient name and ward) for a specific bed.
* **Why it is Critical**: Allows nurse stations to associate physical devices (beds) with actual patients and ward locations.
* **Input Parameters**:
  * `bedId`: `string`
  * `meta`: `{ patientName: string; ward: string }`
* **Expected Output or State Change**:
  * Merges the metadata into the corresponding bed state.
  * If the bed does not exist in the store, the state must remain unchanged.
* **Equivalence Partitions**:
  * **Bed Existence**:
    * Bed ID exists in state.
    * Bed ID does not exist in state.
  * **Metadata Content**:
    * Standard alphanumeric strings.
    * Empty strings `""` or whitespace strings.
* **Boundary-Value Cases**:
  * Empty strings for name or ward.
* **Negative & Error Cases**:
  * Non-existent bed ID passed.
  * *Missing Input Validation*: Empty strings are accepted without validation or rejection.
* **External Dependencies**: Zustand store.
* **Dependencies to Mock/Stub**: None.
* **Planned Test Cases**:
  * `updates metadata of an existing bed`
  * `leaves store completely unchanged if bed does not exist`
  * `accepts empty patient and ward metadata without validation`

---

### 3. `addAlert`
* **Source File**: [store/index.ts](file:///f:/Academics/Computer-Engineering/Semester-5/3YP/webpage/e21-3yp-Smart-IV/Desktop-App-Rust/src/store/index.ts)
* **Purpose**: Appends a new alert to the alert history log and updates the list of active unresolved alerts.
* **Why it is Critical**: Stores alerts (blockages, empty bags, low battery, connection losses) that require clinical action. The log is capped to prevent memory leaks in long-running desktop sessions.
* **Input Parameters**:
  * `alert`: `AlertRow`
* **Expected Output or State Change**:
  * Prepends the alert to `alerts` history list.
  * If the total number of alerts in history exceeds 500, slices the list to exactly 500 (removing the oldest entries).
  * If `alert.resolvedAt` is null, prepends the alert to `activeAlerts`. Otherwise, leaves `activeAlerts` unchanged.
* **Equivalence Partitions**:
  * **Alert State**:
    * Active (unresolved) alert (`resolvedAt` is `null`).
    * Resolved alert (`resolvedAt` is a string timestamp).
  * **History Capacity**:
    * Current history length < 500.
    * Current history length >= 500 (requires eviction).
* **Boundary-Value Cases**:
  * Capacity boundaries around the store limit of 500 alerts:
    * 499 existing alerts plus one: history reaches exactly 500 alerts, and no alerts are discarded (no evictions).
    * 500 existing alerts plus one: history reaches 501 alerts, triggering the truncation mechanism (`.slice(0, 500)`) and evicting the oldest alert (retains exactly 500).
* **Negative & Error Cases**:
  * Passing alerts with invalid structure or undefined properties.
* **External Dependencies**: Zustand store.
* **Dependencies to Mock/Stub**: None.
* **Planned Test Cases**:
  * `adds unresolved alert to alerts history and active alerts`
  * `adds pre-resolved alert to alerts history but not to active alerts`
  * `caps the history at exactly 500 alerts and discards the oldest`

---

### 4. `resolveAlert`
* **Source File**: [store/index.ts](file:///f:/Academics/Computer-Engineering/Semester-5/3YP/webpage/e21-3yp-Smart-IV/Desktop-App-Rust/src/store/index.ts)
* **Purpose**: Marks a specific alert as resolved, recording the resolver's name and timestamp, and removes it from the active alert queue.
* **Why it is Critical**: Allows nurse stations to acknowledge and clear alarms, restoring the dashboard UI to normal once safety issues are addressed.
* **Input Parameters**:
  * `id`: `number` (Alert ID)
  * `resolvedBy`: `string`
* **Expected Output or State Change**:
  * For the alert matching `id` in the `alerts` history array: sets `resolvedAt` to the current ISO timestamp and `resolvedBy` to the provided name.
  * Removes the alert matching `id` from the `activeAlerts` array.
  * If the alert ID does not exist, makes no state modifications.
* **Equivalence Partitions**:
  * **Alert ID Existence**:
    * Alert ID is found in both `alerts` history and `activeAlerts`.
    * Alert ID does not exist.
  * **Resolver Name**:
    * Valid non-empty string.
    * Empty string or whitespace.
* **Boundary-Value Cases**:
  * There are no numeric boundary rules for alert IDs in the store implementation. Any unique number is matched.
* **Negative & Error Cases**:
  * Non-existent ID.
  * *Missing Input Validation*: Empty resolver name string is accepted without rejection.
* **External Dependencies**: Zustand store.
* **Dependencies to Mock/Stub**: `Date.prototype.toISOString` (to stub the generated timestamp `resolvedAt`).
* **Planned Test Cases**:
  * `marks alert as resolved in history and removes from activeAlerts`
  * `leaves alert contents unchanged if alert ID is not found`
  * `handles empty resolver name string`

---

## Team Assignments (Prepared for next step)

The following table documents the planned division of work for individual contribution testing:

| Team Member Name | Student ID | Assigned Function |
| :--- | :--- | :--- |
| Pavindran V. | E/21/283 | `upsertBed` |
| Shagiththiah K. | E/21/375 | `setBedMeta` |
| Suthail A.L.M. | E/21/395 | `addAlert` |
| Paarkavi J. | E/21/206 | `resolveAlert` |

*Note: These assignments are prepared for the next step of the project. No individual contribution tests have been added yet.*
