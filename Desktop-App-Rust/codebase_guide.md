# Smart IV Desktop App — Complete Codebase Guide

## 1. Technology Stack

| Layer | Technology | Why |
|---|---|---|
| **Desktop Shell** | [Tauri v2](https://tauri.app/) (Rust) | Wraps the web UI as a native Windows `.exe`. Far lighter than Electron. |
| **UI Framework** | React 18 + TypeScript | Component-based UI with type safety |
| **UI Build Tool** | Vite | Fast hot-reload dev server and production bundler |
| **Styling** | Vanilla CSS (`index.css`) | Full control, light medical theme |
| **Routing** | React Router v6 (`HashRouter`) | Client-side page navigation inside the app |
| **Global State** | Zustand | Lightweight React state manager (no boilerplate like Redux) |
| **Charts** | Recharts | Flow rate history chart in the bed detail modal |
| **Icons** | Lucide React | Clean SVG icon set |
| **Backend Language** | Rust (inside `src-tauri/`) | Safe, fast, no garbage collector — ideal for real-time serial I/O |
| **Async Runtime** | Tokio | Rust's async engine for serial reading, MQTT, DB writes concurrently |
| **Database** | SQLite via sqlx | Local on-device storage — no internet needed for core function |
| **Serial/USB** | tokio-serial + serialport | Reads JSON packets from the ESP32 USB receiver |
| **Cloud** | MQTT via rumqttc → AWS IoT Core | Forwards live telemetry to the cloud |
| **Installer** | NSIS (via Tauri) | Generates the Windows `.exe` installer |

---

## 2. Folder Structure — Every File Explained

```
Desktop-App-Rust/
├── src/                        ← All React/TypeScript frontend code
│   ├── main.tsx                ← Entry point. Boots React. Loads simulator module.
│   ├── App.tsx                 ← Root component. Sets up routing + layout.
│   ├── index.css               ← ENTIRE design system (colors, layout, components)
│   ├── types.ts                ← All shared TypeScript type definitions
│   ├── components/             ← Reusable UI building blocks
│   │   ├── Sidebar.tsx         ← Left navigation bar + simulation toggle
│   │   ├── WardGrid.tsx        ← The 4-column grid of all bed cards
│   │   ├── BedCard.tsx         ← Single bed card (flow rate, volume, battery)
│   │   ├── BedDetailModal.tsx  ← Pop-up with chart when you click a bed
│   │   └── AlertBanner.tsx     ← (unused in dashboard, kept for reference)
│   ├── pages/                  ← Full-page views (one per sidebar tab)
│   │   ├── Dashboard.tsx       ← Default home screen with stats + ward grid
│   │   ├── History.tsx         ← Telemetry chart for a selected bed
│   │   ├── Alerts.tsx          ← Alert log table with resolve action
│   │   └── Settings.tsx        ← Serial port, MQTT, nurse config panel
│   ├── store/
│   │   └── index.ts            ← All Zustand stores (beds, alerts, settings, serial)
│   ├── lib/
│   │   └── tauriEvents.ts      ← Bridge: subscribes to Rust events, exposes IPC commands
│   └── mock/
│       └── simulator.ts        ← 16-bed fake data engine for demo/testing
│
├── src-tauri/                  ← All Rust backend code
│   ├── tauri.conf.json         ← App name, window size, bundle/installer config
│   ├── Cargo.toml              ← Rust dependencies (crates)
│   ├── build.rs                ← Required by Tauri (do not touch)
│   ├── capabilities/
│   │   └── default.json        ← Tauri security: what the frontend is allowed to do
│   ├── icons/                  ← App icons + installer BMP images
│   └── src/
│       ├── main.rs             ← 3-line Rust entry point (just calls lib.rs)
│       ├── lib.rs              ← Tauri app setup, registers all commands, opens DB
│       ├── models.rs           ← All Rust data structs (BedPacket, Alert, Session, etc.)
│       ├── db.rs               ← All SQLite operations (4 tables, all CRUD)
│       ├── serial.rs           ← Serial port reader loop (the hardware bridge)
│       ├── alert.rs            ← Alert rule engine (evaluates every incoming packet)
│       ├── commands.rs         ← IPC command handlers (called by the React frontend)
│       └── mqtt.rs             ← MQTT publisher to AWS IoT Core
│
├── index.html                  ← Root HTML template Vite injects the app into
├── vite.config.ts              ← Vite build settings (port 1420, Tauri plugin)
├── package.json                ← npm scripts and frontend dependencies
├── tsconfig.json               ← TypeScript compiler config
└── dist/                       ← Built frontend output (generated, do not edit)
```

---

## 3. Architecture — The Big Picture

```
[ESP32 IV Pump]
      |  BLE/RF
      ↓
[ESP32 USB Receiver] ──── USB/Serial (COM port) ────→ [Rust Backend]
                                                              |
                                          ┌───────────────────┼──────────────────┐
                                          ↓                   ↓                  ↓
                                   [SQLite DB]         [Alert Engine]    [MQTT Publisher]
                                   (smartiv.db)        (alert.rs)              |
                                          |                   |                 ↓
                                          └─────────────┐     |         [AWS IoT Core]
                                                        ↓     ↓
                                              [Tauri Event System]
                                              ('bed-update', 'alert-fired')
                                                        |
                                                        ↓
                                              [React Frontend]
                                              (Zustand stores → UI components)
```

**Key architectural principle:** The serial reader (`serial.rs`) is the single source of truth. It runs in its own async loop forever. Everything downstream — DB write, alert check, UI update, cloud push — happens as a result of one packet arriving from serial. If the cloud (MQTT) is down, the serial loop continues uninterrupted.

---

## 4. Exact Data Flow: Hardware → App → Cloud

### Step-by-step for ONE packet arriving

**1. Hardware sends data**
- The ESP32 pump controller sends telemetry over BLE/RF to a base-station ESP32 connected via USB.
- The base station outputs newline-delimited JSON on the serial port, like:
```json
{"bedId":"03","status":"STABLE","flowRate":82.4,"volRemaining":312.5,"maxVolume":500,"battery":78,"dropFactor":20,"targetMlhr":80,"sessionId":"sess-abc"}
```

**2. `serial.rs` — reads the line**
- `SerialReader::read_loop()` uses `tokio-serial` to asynchronously read the USB port one line at a time.
- It calls `serde_json::from_str::<BedPacket>(&raw)` to parse the JSON into a typed Rust struct.
- It stamps the current UTC timestamp onto `packet.ts`.

**3. `db.rs::insert_telemetry()` — persists to SQLite**
- The packet's `flowRate`, `volRemaining`, `battery`, and `status` are written into the `telemetry` table.
- This row is permanent historical data. Used by the History page.

**4. `alert.rs::AlertEngine::evaluate()` — checks for danger**
- Looks at `packet.status`: if it's `BLOCKAGE`, `EMPTY_BAG`, or `CONN_LOST`, an alert is triggered.
- Independently checks `packet.battery < 20` for a `BATTERY_LOW` alert.
- Uses an in-memory `HashMap` to de-duplicate: will not fire the same alert twice for the same bed.
- If new alert: writes it to the `alerts` SQLite table, then emits `"alert-fired"` Tauri event.

**5. `app.emit("bed-update", &packet)` — pushes to UI**
- Tauri's event system sends the packet from Rust directly to the React window.
- This is like a WebSocket message from Rust → JavaScript.

**6. `mqtt.rs::publish_telemetry()` — sends to cloud**
- If MQTT is connected, publishes the JSON to topic: `smartiv/{thingName}/{bedId}/telemetry`
- This is AWS IoT Core. Non-blocking — if it fails, the serial loop doesn't care.

**7. React: `tauriEvents.ts` — receives the event**
- `bootstrapTauriEvents()` (called once on app start) sets up listeners via Tauri's `listen()` API.
- On `"bed-update"`: calls `useBedsStore.getState().upsertBed(packet)`.
- On `"alert-fired"`: calls `useAlertsStore.getState().addAlert(alert)`.

**8. Zustand stores — update global state**
- `useBedsStore.upsertBed()` merges the new packet into the `beds` map (keyed by `bedId`).
- React components that use `useBedsStore` automatically re-render with the new data.

**9. UI re-renders**
- `WardGrid` → `BedCard` shows updated flow rate, volume, battery.
- `Dashboard` stats row updates its counts.
- `Sidebar` alert badge count updates.
- `Alerts` page shows new alert row.

---

## 5. The IPC System (How UI talks to Rust)

The frontend cannot directly call Rust functions. It uses **Tauri IPC** (Inter-Process Communication), which is like an internal API.

**From React → Rust (Commands):**
- Defined in `commands.rs` with `#[command]` attribute.
- Called from `tauriEvents.ts` via `commands.xxx()` helper.
- Registered in `lib.rs` inside `invoke_handler![]`.

**From Rust → React (Events):**
- Rust calls `app.emit("event-name", payload)`.
- React subscribes with `listen("event-name", handler)` in `tauriEvents.ts`.

**Full command list (`tauriEvents.ts` → `commands.rs`):**

| Frontend call | Rust function | What it does |
|---|---|---|
| `commands.listSerialPorts()` | `list_serial_ports` | Returns available COM ports |
| `commands.connectSerial(port, baud)` | `connect_serial` | Starts serial reader loop |
| `commands.disconnectSerial()` | `disconnect_serial` | Cancels serial reader |
| `commands.getBeds()` | `get_beds` | Fetches all beds from SQLite |
| `commands.upsertBed(bed)` | `upsert_bed` | Add/update a bed record |
| `commands.deleteBed(bedId)` | `delete_bed` | Remove a bed |
| `commands.getTelemetry(bedId, hours)` | `get_telemetry` | Historical data for charts |
| `commands.getAlerts(limit)` | `get_alerts` | Recent alerts log |
| `commands.getActiveAlerts()` | `get_active_alerts` | Unresolved alerts only |
| `commands.resolveAlert(id, by)` | `resolve_alert` | Mark alert as resolved |
| `commands.connectMqtt(...)` | `connect_mqtt` | Start MQTT connection |
| `commands.disconnectMqtt()` | `disconnect_mqtt` | Stop MQTT connection |
| `commands.purgeTelemetry(days)` | `purge_telemetry` | Delete old DB rows |

---

## 6. The Database (SQLite — `smartiv.db`)

Located at `%APPDATA%\lk.ac.pdn.smartiv.desktop\smartiv.db` on the installed machine.

**4 tables:**

**`beds`** — master registry of IV beds in the ward
```sql
bed_id TEXT PRIMARY KEY      -- e.g. "01", "02"
patient_name TEXT            -- "Kamal Perera"
ward TEXT                    -- "General Ward"
drop_factor INTEGER          -- drops/mL (typically 20)
mac_address TEXT             -- ESP32 MAC for identification
created_at DATETIME
```

**`sessions`** — one IV infusion session per bed
```sql
session_id TEXT PRIMARY KEY  -- UUID
bed_id TEXT                  -- references beds
max_volume_ml REAL           -- e.g. 500.0 mL
target_ml_hr REAL            -- e.g. 80.0 mL/hr
started_at DATETIME
ended_at DATETIME            -- NULL if still running
end_reason TEXT              -- 'COMPLETED', 'CANCELLED', 'ERROR'
```

**`telemetry`** — time-series data, one row per packet received
```sql
id INTEGER AUTOINCREMENT
bed_id TEXT
session_id TEXT
ts DATETIME
flow_rate_ml REAL
vol_remaining REAL
battery_pct INTEGER
status TEXT                  -- 'STABLE', 'BLOCKAGE', etc.
```

**`alerts`** — every alert ever fired
```sql
id INTEGER AUTOINCREMENT
bed_id TEXT
session_id TEXT
ts DATETIME
alert_type TEXT              -- 'BLOCKAGE', 'EMPTY_BAG', 'CONN_LOST', 'BATTERY_LOW'
resolved_at DATETIME         -- NULL if unresolved
resolved_by TEXT             -- nurse name
```

---

## 7. Zustand Stores (`src/store/index.ts`)

All global state lives here. Components read from these stores and re-render automatically when they change.

**`useBedsStore`** — live telemetry state
- `beds: Record<string, LiveBedState>` — map of bedId → current state
- `upsertBed(packet)` — merge new packet into the map
- `clearBeds()` — wipe all beds (used when stopping simulation)

**`useAlertsStore`** — alert state
- `alerts[]` — full history
- `activeAlerts[]` — unresolved only (drives the red badge count in sidebar)
- `addAlert()`, `resolveAlert()`

**`useSettingsStore`** — app configuration
- `settings: AppSettings` — serial port, baud rate, MQTT config, nurse name, thresholds
- `updateSettings(patch)` — partial update

**`useSerialStore`** — connection status
- `connected: boolean`, `port: string` — USB state shown in sidebar
- `mqttConnected: boolean` — cloud state shown in sidebar
- `packetCount: number` — total packets received since app start

> **Important pattern:** Never use `Object.values(s.beds)` directly inside a component selector — it creates a new array reference every render, causing infinite re-render loops. Always wrap in `useMemo`:
> ```typescript
> const bedsMap = useBedsStore((s) => s.beds);
> const beds = useMemo(() => Object.values(bedsMap), [bedsMap]);
> ```

---

## 8. The Mock Simulator (`src/mock/simulator.ts`)

Used when there is no real hardware. Completely isolated from production logic.

- Creates 16 fake beds with Sri Lankan patient names.
- Assigns scenarios: `NORMAL` (13 beds), `BLOCKAGE` (bed 4), `EMPTY_BAG` (bed 8), `LOW_BATTERY` (bed 12), `CONN_LOST` (bed 16).
- Every 2 seconds, drains volume based on flow rate and slightly fluctuates flow.
- Calls `useBedsStore.getState().upsertBed()` directly — bypasses Tauri, works in browser too.
- Controlled via the **"Simulate Ward"** button in the Sidebar.
- `LOW_BATTERY` scenario: status stays `STABLE`, but `battery` is set to 12 — the alert engine picks this up and fires `BATTERY_LOW`.

---

## 9. "If I want to change X" — Quick Reference Guide

### Change the UI colors / theme
→ **`src/index.css`** — Edit the `:root { }` block at the top. Every color is a CSS variable. `--bg-base` is the page background, `--blue-500` is the primary accent, `--red-500` is alerts, `--green-500` is stable, `--yellow-500` is warnings.

### Change what appears on a bed card
→ **`src/components/BedCard.tsx`** — Edit the JSX. The `bed` prop gives you access to all live fields: `bed.flowRate`, `bed.volRemaining`, `bed.battery`, `bed.status`, `bed.patientName`, etc.

### Change the stats shown at the top of the Dashboard
→ **`src/pages/Dashboard.tsx`** — Edit the `stats` useMemo calculation and the JSX below it.

### Add a new page / tab
1. Create `src/pages/NewPage.tsx`
2. Add a route in `src/App.tsx`: `<Route path="/newpage" element={<NewPage />} />`
3. Add a nav item in `src/components/Sidebar.tsx` in the `NAV_ITEMS` array.

### Change the alert battery threshold (currently 20%)
→ **`src-tauri/src/alert.rs`** — Line 44: `if packet.battery < 20`. Change `20` to any value.

### Add a new alert type (e.g., flow rate deviation)
→ **`src-tauri/src/alert.rs`** — Add a new `let new_alert: Option<&str>` check. Add it to the `for atype in [...]` loop. Add its string name to `AlertRow['alertType']` in **`src/types.ts`**.

### Change the serial baud rate default
→ **`src/store/index.ts`** — `DEFAULT_SETTINGS.baudRate`. Also update the dropdown in **`src/pages/Settings.tsx`**.

### Change how often simulation updates
→ **`src/mock/simulator.ts`** — The `setInterval(..., 2000)` call. Change `2000` (milliseconds).

### Change the MQTT topic structure
→ **`src-tauri/src/mqtt.rs`** — `publish_telemetry()` function. Change the `format!("smartiv/{}/...")` string.

### Change database retention (currently 7 days)
→ **`src-tauri/src/lib.rs`** — `db::purge_telemetry(&db, 7)`. Also settable at runtime via Settings page.

### Change the app window size
→ **`src-tauri/tauri.conf.json`** — `app.windows[0].width` and `height`.

### Add a new Rust IPC command
1. Write the function in **`src-tauri/src/commands.rs`** with `#[command]`.
2. Register it in **`src-tauri/src/lib.rs`** inside `invoke_handler![]`.
3. Add a typed wrapper in **`src/lib/tauriEvents.ts`** inside the `commands` object.
4. Call it from any React component via `commands.yourNewCommand()`.

---

## 10. Error Debugging Guide

### "No beds showing on dashboard"
- **In dev mode (browser):** The simulator should auto-start. Check browser console for `[Mock Simulator] Starting...`.
- **In Tauri dev mode:** There's no hardware, so no beds appear. Click "Simulate Ward" in the sidebar.
- **In production with hardware:** Go to Settings → select the correct COM port → click Connect Serial.

### "Build fails with TypeScript error"
- Almost always a type mismatch. The key rule: any value you add to `status` in `simulator.ts` **must** exist in `BedStatus` in `src/types.ts`.

### "Build fails with `Access is denied` (os error 5)"
- Windows Defender is blocking Rust compilation. Add `src-tauri\target` to Defender exclusions.

### "App crashes on startup with `PluginInitialization` error"
- Invalid field in `src-tauri/tauri.conf.json`. Tauri validates the config strictly. Check the error message for which field.

### "Infinite re-render / app freezes"
- A Zustand selector is returning a new object/array reference every render. Wrap it in `useMemo` as shown in Section 7.

### "Alerts not firing for a bed"
- Check `src-tauri/src/alert.rs` — the de-dup cache (`LAST_ALERT`) suppresses repeated alerts for the same bed. Once a bed recovers to `STABLE`, the cache clears and alerts can fire again.

### "Serial data not arriving"
- Verify COM port in Settings matches the actual port in Device Manager.
- Verify baud rate matches what the ESP32 firmware is set to (typically 115200).
- Check that only one application is connected to the COM port at a time.

### "MQTT not connecting"
- The TLS configuration in `mqtt.rs` has empty certificate arrays (`ca: vec![]`). For AWS IoT Core production use, you must load the CA certificate, client certificate, and private key files from disk.

---

## 11. Complete Type Reference (`src/types.ts`)

```typescript
// What the ESP32 sends (matches Rust BedPacket in models.rs)
interface BedPacket {
  bedId: string;
  status: 'STABLE' | 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST' | 'OFFLINE';
  flowRate: number;      // mL/hr — current measured rate
  volRemaining: number;  // mL — liquid left in the bag
  maxVolume: number;     // mL — starting bag size
  battery: number;       // 0-100% — pump battery
  dropFactor: number;    // drops/mL — physical drip chamber type
  targetMlhr: number;    // mL/hr — prescribed rate
  sessionId: string | null;
  ts?: string;           // ISO 8601 timestamp, added by desktop app
}

// BedPacket + display metadata (what Zustand stores)
interface LiveBedState extends BedPacket {
  patientName: string;
  ward: string;
  lastSeen: number;     // Date.now() — used to detect stale connections
  isConnected: boolean;
}

// One row from the alerts table
interface AlertRow {
  id: number;
  bedId: string;
  sessionId: string | null;
  ts: string;
  alertType: 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST' | 'BATTERY_LOW';
  resolvedAt: string | null;
  resolvedBy: string | null;
}

// One row from the telemetry table (used in History page)
interface TelemetryRow {
  id: number;
  bedId: string;
  sessionId: string | null;
  ts: string;
  flowRateMl: number;
  volRemaining: number;
  batteryPct: number;
  status: BedStatus;
}
```
