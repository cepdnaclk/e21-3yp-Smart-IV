/**
 * explore.js — SmartIV Ask Page
 *
 * Architecture:
 *  - Uses Google Gemini API directly from the browser (gemini-2.0-flash).
 *  - Project knowledge is embedded inline below as CONTEXT_DOCS.
 *  - Supports multi-turn conversation with full message history.
 *  - Streams the AI response token-by-token for a real-time feel.
 */

/* =====================================================================
   SECTION 1 — CONFIGURATION
   ===================================================================== */

// API key is loaded from gemini_config.js (gitignored — never committed).
// If that file is missing, GEMINI_API_KEY_CONFIG will be undefined and the UI
// will show a friendly error asking the user to set up the config file.
const GEMINI_API_KEY = (typeof GEMINI_API_KEY_CONFIG !== 'undefined')
    ? GEMINI_API_KEY_CONFIG
    : '';

const GEMINI_MODEL   = 'gemini-2.0-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

/* =====================================================================
   SECTION 2 — EMBEDDED PROJECT KNOWLEDGE BASE
   (Content from README.md, desktop_codebase_guide.md, mobile_codebase_guide.md)
   ===================================================================== */

const CONTEXT_DOCS = `
=== DOCUMENT 1: PROJECT README (README.md) ===

# Smart IV — IoT Digital Co-Pilot for IV Drip Monitoring

> "An IoT Digital Co-Pilot for Sustainable Healthcare"
> A 3rd Year Project · Group 19 · Department of Computer Engineering · Faculty of Engineering · University of Peradeniya

## Overview

Smart IV is a compact, clip-on IoT retrofit device that transforms any standard gravity-drip IV set into a closed-loop smart infusion system — without replacing existing equipment or requiring proprietary consumables.

It targets the critical gap in healthcare infrastructure faced by general wards in developing nations: manual IV drips are cheap and universal, but dangerously unreliable, while commercial volumetric infusion pumps ($1,000–$5,000) are confined to the ICU. Smart IV bridges this gap at a fraction of the cost (~$120 USD / ~LKR 26,000 per unit).

Smart IV is NOT a replacement for nurses — it is a digital co-pilot that handles real-time monitoring, closed-loop flow regulation, and multi-channel alerting so nursing staff can focus on high-value patient care instead of repeatedly checking drip bags.

Key stats from the problem space:
- 79% of manual gravity-led IV infusions deviate from the prescribed drop rate by over 20%
- 1 in 3 IV-related incidents occur due to delayed nurse response to drip completion
- Average nurse shift is ~8 hours, during which dozens of IV bags must be monitored per ward

## The Problem

|                      | Manual IV Set (~$5) | Smart IV (~$120)      | Volumetric Pump ($1,000–$5,000) |
|----------------------|---------------------|-----------------------|---------------------------------|
| Flow control         | Gravity only        | Closed-loop PID       | Precision peristaltic           |
| Real-time monitoring | None                | Continuous            | Continuous                      |
| Alerts to nurses     | None                | Local + Remote        | Local only                      |
| Retrofit-compatible  | Standard IV sets    | Standard IV sets      | Proprietary sets only           |
| Suitable for wards   | Yes                 | Yes                   | ICU only                        |

Real-world consequences: documented cases of gangrene, amputation from extravasation events, and hospital legal actions — all from unmonitored IV administration in general wards.

## Key Features

- Closed-Loop PID Flow Control — IR drop sensor feedback drives a stepper motor to continuously correct flow rate to match the nurse's prescribed target (mL/hr)
- Centralized Nurse Dashboard — Desktop app monitors all ward beds simultaneously with color-coded status badges (Stable / Warning / Alert)
- Multi-Channel Alerting — Anomaly detection fires safety interlocks locally on-device, visual alerts on dashboard, and push notifications to off-ward nurses via mobile app
- Retrofit & Non-Invasive — Clips onto any standard IV pole and drip set; no modifications to existing hospital infrastructure
- Local-First Resilience — Device continues infusing and alerting locally if Wi-Fi or cloud connectivity is lost
- IoT-Enabled — ESP-NOW edge mesh → UART/USB relay → MQTT over TLS → AWS IoT Core → React Native mobile app
- Predictive Volume Tracking — Counts every drop (with IR sensor) and subtracts from entered bag volume to compute time-to-empty in real time
- Battery Backup — Li-Ion UPS maintains continuous operation during mains power outages

## System Architecture

Smart IV uses a 3-tier IoT architecture: Edge → Local Station → Cloud.

TIER 1 — EDGE LAYER (Bedside):
- ESP32-S3 units at each bed, each with IR drop sensor + NEMA 17 stepper motor
- Runs closed-loop PID control for flow regulation
- Communicates via ESP-NOW (encrypted, no router needed) to the local station

TIER 2 — LOCAL STATION (Ward Level):
- ESP32 USB Receiver Dongle connects to the Nurse Station PC
- Tauri + React desktop app with SQLite database
- Alert rule engine evaluates every incoming packet
- Publishes to cloud via MQTT over TLS

TIER 3 — CLOUD LAYER (Remote Access):
- AWS IoT Core receives telemetry and routes alerts through AWS Lambda → SNS
- React Native mobile app for nurses/doctors on iOS & Android
- AWS Cognito for role-based access control (Nurse / Ward Sister / Admin)
- DynamoDB for optional cloud storage

## Hardware Components (per bedside unit)

| #  | Component             | Model / Notes                           | Unit Price (LKR) |
|----|-----------------------|-----------------------------------------|------------------|
| 1  | Primary MCU           | ESP32-S3 Development Board              | 2,150.00         |
| 2  | Secondary MCU (Dongle)| ESP32 DevKit V1                         | 1,835.00         |
| 3  | Stepper Motor         | NEMA 17 Bipolar (actuator)              | 2,240.00         |
| 4  | Motor Driver          | TMC2208 Silent Driver                   | 1,390.00         |
| 5  | Display               | Arduino LCD + Logic Level Converter     | 1,950.00         |
| 6  | Input                 | 4×4 Keypad Module + Buttons             | 820.00           |
| 7  | Drop Sensor           | IR Speed Sensor Module LM393            | 150.00           |
| 8  | Power Supply          | WX-DC2412 Switching Module              | 2,950.00         |
| 9  | Battery UPS           | 2× 18650 Cells + Holder + BMS           | 1,305.00         |
| 10 | Voltage Regulator     | Buck Converter + Cover                  | 300.00           |
| 11 | Testing               | Standard IV sets (×3) + NaCl bags (×4) | 1,258.08         |
| 12 | Chassis               | 3D Injection Moulded Enclosure          | 5,000.00         |
| 13 | Alert                 | Buzzer                                  | 55.00            |
| 14 | Misc                  | PCBs, Screws, Bearings, Connectors      | 4,820.00         |
|    | **Total per unit**    |                                         | LKR 26,223.08 (~$120 USD) |

Physical Design:
- Clips onto any standard IV pole — no infrastructure changes
- LCD display: target flow rate (mL/hr), infusion status, volume remaining
- Physical controls: Start / Change / Stop
- Li-Ion UPS for uninterrupted operation
- Custom PCB for compact, production-ready form factor

Sensors & Actuation:
- IR Optical Drop Sensor (LM393): counts drips passing through the drip chamber; two sensors provide redundancy
- NEMA 17 Stepper Motor + TMC2208 Driver: flow actuator by precisely compressing/releasing the IV tube clamp
- ESP32 Dual-Core: Core 1 = PID control loop + safety interlocks; Core 0 = ESP-NOW wireless communication

## Software Stack

| Layer            | Technology                                    |
|------------------|-----------------------------------------------|
| Firmware         | ESP32 (Arduino / ESP-IDF), ESP-NOW            |
| Desktop App      | Tauri 2 (Rust backend) + React (TypeScript)   |
| Desktop DB       | SQLite via sqlx                               |
| Cloud Messaging  | MQTT over TLS (rumqttc) → AWS IoT Core        |
| Cloud Compute    | AWS Lambda                                    |
| Cloud Notify     | AWS SNS                                       |
| Cloud Auth       | AWS Cognito (Amplify)                         |
| Mobile App       | React Native (Expo)                           |

## Data Flow: Physical Drop → Nurse Alert

1. Sense (Edge): IR sensor counts drops → computes real-time Drops Per Minute (DPM)
   - vol_remaining = max_volume - (drops_counted / drop_factor)
2. Compute & Control (ESP32 Core 1): PID controller runs on every sensor reading
   - Error e(t) = Target_DPM − Measured_DPM
   - Output u(t) = Kp·e(t) + Ki·∫e(t)dt + Kd·de(t)/dt
   - Stepper step_freq ← f(u(t))
   - Anomaly: if DPM==0 and vol>0 → BLOCKAGE; if DPM==0 and vol==0 → EMPTY_BAG
3. Transmit via ESP-NOW (CCMP-encrypted, ~1–5 ms latency)
4. Relay: ESP32 Receiver Node → USB/UART → Tauri Rust backend
5. Display: React frontend receives Tauri events, updates Zustand store
6. Escalate: MQTT to AWS IoT Core → Lambda → SNS → mobile push notification

MQTT topic structure:
- smartiv/{ward}/{bed_id}/telemetry  ← continuous telemetry
- smartiv/{ward}/{bed_id}/alert      ← alert events only

## Safety & Resilience Design

| Scenario              | Immediate Response                         | Cloud Required? |
|-----------------------|--------------------------------------------|-----------------|
| Tube Blockage         | Stop motor + LCD alert + Dashboard Red     | No              |
| Empty Bag             | Emergency clamp + Dashboard alert          | No              |
| Wi-Fi / Cloud Loss    | Continue infusion normally + LCD alert     | —               |
| Desktop Conn. Loss    | Continue infusion + LCD alert              | No              |
| Mains Power Outage    | Li-Ion UPS maintains full operation        | No              |
| Low Battery           | Dashboard yellow warning + mobile push     | Optional        |

All critical safety responses execute locally on the ESP32 with zero cloud round-trip latency.

## Network & Security

| Layer          | Protocol       | Encryption          | Infrastructure Needed |
|----------------|----------------|---------------------|-----------------------|
| Edge → Station | ESP-NOW        | CCMP (AES-128)      | None — no router      |
| Station → Cloud| MQTT over TLS  | TLS transport layer | Wi-Fi / LAN           |
| Cloud → Mobile | HTTPS/WebSocket| TLS                 | Internet              |
| Mobile Auth    | AWS Cognito    | JWT / OAuth 2.0     | Internet              |

## SQLite Schema

Tables: beds, sessions, telemetry, alerts
- beds: bed_id, patient_name, ward, drop_factor, mac_address, created_at
- sessions: session_id, bed_id, max_volume_ml, target_ml_hr, started_at, ended_at, end_reason
- telemetry: id, bed_id, session_id, ts, flow_rate_ml, vol_remaining, battery_pct, status
- alerts: id, bed_id, session_id, ts, alert_type, resolved_at, resolved_by

## Testing Status

| Test Area | Test                                    | Status       |
|-----------|-----------------------------------------|--------------|
| Hardware  | IR drop sensor accuracy                 | ✅ Validated |
| Hardware  | Stepper motor precision                 | ✅ Validated |
| Hardware  | Wi-Fi & MQTT reliability                | ✅ Validated |
| Hardware  | Battery life under continuous operation | 🔄 In Progress|
| Hardware  | Hospital temperature/humidity           | 🔄 In Progress|
| Software  | Unit tests — all backend API endpoints  | ✅ Validated |
| Software  | Integration: hardware → MQTT → mobile   | ✅ Validated |
| Software  | Alert delivery latency (<3 seconds)     | ✅ Validated |
| Software  | Load test — 20+ simultaneous devices    | 🔄 In Progress|
| Software  | User acceptance testing (nursing staff) | 📋 Planned   |

## Budget

Total estimated hardware cost per unit: LKR 26,223.08 (~$120 USD)
This is under 6% of the cost of a commercial volumetric infusion pump ($1,000–$5,000).
Cloud hosting costs are separate and scale with ward size.

## Team

| Name            | Registration | GitHub                  |
|-----------------|--------------|-------------------------|
| Pavindran V.    | E/21/283     | @pavindranvelalagan      |
| Shagiththiah K. | E/21/375     | @shagiththiah           |
| Suthail A.L.M   | E/21/395     | @EngSuthail             |
| Paarkavi J.     | E/21/206     | @paarkavi29             |

Department: Computer Engineering, Faculty of Engineering, University of Peradeniya (E21 batch, Group 19)

## Supervisors

- Ms. Yasodha Vimukthi — Lecturer, Department of Computer Engineering, University of Peradeniya
- Dr. Isuru Nawinne — Senior Lecturer, Department of Computer Engineering, University of Peradeniya

## Acknowledgements

- Department of Computer Engineering, Faculty of Engineering, University of Peradeniya
- SLIoT Challenge — recognized as finalists
- Open-source communities: ESP-IDF, Tauri, React Native, Rust async ecosystem

=== END DOCUMENT 1 ===


=== DOCUMENT 2: DESKTOP APP CODEBASE GUIDE (Desktop-App-Rust/desktop_codebase_guide.md) ===

# Smart IV Desktop App — Complete Codebase Guide

## 1. Technology Stack

| Layer          | Technology                              | Why                                              |
|----------------|-----------------------------------------|--------------------------------------------------|
| Desktop Shell  | Tauri v2 (Rust)                         | Native Windows .exe, far lighter than Electron   |
| UI Framework   | React 18 + TypeScript                   | Component-based UI with type safety              |
| UI Build Tool  | Vite                                    | Fast hot-reload dev server and production bundler|
| Styling        | Vanilla CSS (index.css)                 | Full control, light medical theme               |
| Routing        | React Router v6 (HashRouter)            | Client-side page navigation                     |
| Global State   | Zustand                                 | Lightweight React state manager                 |
| Charts         | Recharts                                | Flow rate history chart in bed detail modal     |
| Icons          | Lucide React                            | Clean SVG icon set                              |
| Backend        | Rust (inside src-tauri/)               | Safe, fast, no GC — ideal for real-time serial  |
| Async Runtime  | Tokio                                   | Rust's async engine for serial, MQTT, DB        |
| Database       | SQLite via sqlx                         | Local on-device storage, no internet needed     |
| Serial/USB     | tokio-serial + serialport               | Reads JSON packets from ESP32 USB receiver      |
| Cloud          | MQTT via rumqttc → AWS IoT Core         | Forwards live telemetry to cloud                |
| Installer      | NSIS (via Tauri)                        | Generates Windows .exe installer                |

## 2. Folder Structure

Desktop-App-Rust/
├── src/                         ← All React/TypeScript frontend code
│   ├── main.tsx                 ← Entry point
│   ├── App.tsx                  ← Root component, routing + layout
│   ├── index.css                ← ENTIRE design system
│   ├── types.ts                 ← All shared TypeScript type definitions
│   ├── components/
│   │   ├── Sidebar.tsx          ← Left navigation + simulation toggle
│   │   ├── WardGrid.tsx         ← 4-column grid of all bed cards
│   │   ├── BedCard.tsx          ← Single bed card (flow rate, volume, battery)
│   │   ├── BedDetailModal.tsx   ← Pop-up with chart when you click a bed
│   │   └── AlertBanner.tsx      ← Alert strip (kept for reference)
│   ├── pages/
│   │   ├── Dashboard.tsx        ← Default home screen with stats + ward grid
│   │   ├── History.tsx          ← Telemetry chart for a selected bed
│   │   ├── Alerts.tsx           ← Alert log table with resolve action
│   │   └── Settings.tsx         ← Serial port, MQTT, nurse config panel
│   ├── store/
│   │   └── index.ts             ← All Zustand stores (beds, alerts, settings, serial)
│   ├── lib/
│   │   └── tauriEvents.ts       ← Bridge: subscribes to Rust events, exposes IPC commands
│   └── mock/
│       └── simulator.ts         ← 16-bed fake data engine for demo/testing
│
├── src-tauri/                   ← All Rust backend code
│   ├── tauri.conf.json          ← App name, window size, bundle config
│   ├── Cargo.toml               ← Rust dependencies
│   ├── build.rs                 ← Required by Tauri (do not touch)
│   ├── capabilities/
│   │   └── default.json         ← Tauri security permissions
│   ├── icons/                   ← App icons + installer BMP images
│   └── src/
│       ├── main.rs              ← 3-line Rust entry point
│       ├── lib.rs               ← Tauri app setup, registers all commands, opens DB
│       ├── models.rs            ← All Rust data structs (BedPacket, Alert, Session)
│       ├── db.rs                ← All SQLite operations (4 tables, all CRUD)
│       ├── serial.rs            ← Serial port reader loop (hardware bridge)
│       ├── alert.rs             ← Alert rule engine (evaluates every incoming packet)
│       ├── commands.rs          ← IPC command handlers called by React frontend
│       └── mqtt.rs              ← MQTT publisher to AWS IoT Core

## 3. Architecture

[ESP32 IV Pump]
      | BLE/RF
      ↓
[ESP32 USB Receiver] ── USB/Serial (COM port) ──→ [Rust Backend]
                                                          |
                               ┌──────────────────────────┼───────────────┐
                               ↓                          ↓               ↓
                        [SQLite DB]              [Alert Engine]    [MQTT Publisher]
                        (smartiv.db)             (alert.rs)              |
                               |                          |              ↓
                               └──────────────┐           |      [AWS IoT Core]
                                              ↓           ↓
                                    [Tauri Event System]
                                    ('bed-update', 'alert-fired')
                                              |
                                              ↓
                                    [React Frontend]
                                    (Zustand stores → UI components)

Key principle: The serial reader (serial.rs) is the single source of truth.
Everything downstream — DB write, alert check, UI update, cloud push — happens as a result of one packet arriving from serial. If the cloud (MQTT) is down, the serial loop continues uninterrupted.

## 4. Exact Data Flow: Hardware → App → Cloud

Step 1 — Hardware sends JSON:
{"bedId":"03","status":"STABLE","flowRate":82.4,"volRemaining":312.5,"maxVolume":500,"battery":78,"dropFactor":20,"targetMlhr":80,"sessionId":"sess-abc"}

Step 2 — serial.rs reads the line:
- SerialReader::read_loop() uses tokio-serial to read USB port one line at a time
- Calls serde_json::from_str::<BedPacket>(&raw) to parse JSON into typed Rust struct
- Stamps current UTC timestamp onto packet.ts

Step 3 — db.rs::insert_telemetry() persists to SQLite:
- Writes flowRate, volRemaining, battery, status into the telemetry table
- Permanent historical data used by History page

Step 4 — alert.rs::AlertEngine::evaluate() checks for danger:
- If status is BLOCKAGE, EMPTY_BAG, or CONN_LOST → alert triggered
- If battery < 20 → BATTERY_LOW alert
- Uses in-memory HashMap to de-duplicate: won't fire same alert twice for same bed
- New alert: writes to alerts SQLite table, emits "alert-fired" Tauri event

Step 5 — app.emit("bed-update", &packet) pushes to UI:
- Tauri's event system sends packet from Rust directly to React window

Step 6 — mqtt.rs::publish_telemetry() sends to cloud:
- If connected, publishes to: smartiv/{thingName}/{bedId}/telemetry
- Non-blocking; if it fails, serial loop doesn't care

Step 7 — tauriEvents.ts receives the event:
- listen<BedPacket>('bed-update', ...) → calls useBedsStore.getState().upsertBed(packet)
- listen('alert-fired', ...) → calls useAlertsStore.getState().addAlert(alert)

Step 8 — Zustand stores update global state:
- useBedsStore.upsertBed() merges new packet into beds map (keyed by bedId)
- React components automatically re-render with new data

## 5. IPC System (How UI talks to Rust)

Frontend → Rust (Commands):
- commands.listSerialPorts() — Returns available COM ports
- commands.connectSerial(port, baud) — Starts serial reader loop
- commands.disconnectSerial() — Cancels serial reader
- commands.getBeds() — Fetches all beds from SQLite
- commands.upsertBed(bed) — Add/update a bed record
- commands.deleteBed(bedId) — Remove a bed
- commands.getTelemetry(bedId, hours) — Historical data for charts
- commands.getAlerts(limit) — Recent alerts log
- commands.getActiveAlerts() — Unresolved alerts only
- commands.resolveAlert(id, by) — Mark alert as resolved
- commands.connectMqtt(...) — Start MQTT connection
- commands.disconnectMqtt() — Stop MQTT connection
- commands.purgeTelemetry(days) — Delete old DB rows

## 6. Zustand Stores (src/store/index.ts)

useBedsStore — live telemetry state:
- beds: Record<string, LiveBedState> — map of bedId → current state
- upsertBed(packet) — merge new packet into the map
- clearBeds() — wipe all beds

useAlertsStore — alert state:
- alerts[] — full history
- activeAlerts[] — unresolved only (drives red badge count in sidebar)
- addAlert(), resolveAlert()

useSettingsStore — app configuration:
- settings: AppSettings — serial port, baud rate, MQTT config, nurse name, thresholds
- updateSettings(patch) — partial update

useSerialStore — connection status:
- connected: boolean, port: string — USB state shown in sidebar
- mqttConnected: boolean — cloud state shown in sidebar
- packetCount: number — total packets received since app start

Important pattern: Never use Object.values(s.beds) directly inside a component selector — wrap in useMemo to avoid infinite re-renders.

## 7. Mock Simulator (src/mock/simulator.ts)

Used when there is no real hardware. Completely isolated from production logic.
- Creates 16 fake beds with Sri Lankan patient names
- Scenarios: NORMAL (13 beds), BLOCKAGE (bed 4), EMPTY_BAG (bed 8), LOW_BATTERY (bed 12), CONN_LOST (bed 16)
- Every 2 seconds, drains volume based on flow rate and slightly fluctuates flow
- Calls useBedsStore.getState().upsertBed() directly — bypasses Tauri, works in browser too
- Controlled via the "Simulate Ward" button in the Sidebar

## 8. Type Reference (src/types.ts)

BedPacket (what ESP32 sends):
- bedId: string
- status: 'STABLE' | 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST' | 'OFFLINE'
- flowRate: number (mL/hr — current measured rate)
- volRemaining: number (mL — liquid left in the bag)
- maxVolume: number (mL — starting bag size)
- battery: number (0-100% — pump battery)
- dropFactor: number (drops/mL — physical drip chamber type)
- targetMlhr: number (mL/hr — prescribed rate)
- sessionId: string | null
- ts?: string (ISO 8601 timestamp, added by desktop app)

LiveBedState extends BedPacket:
- patientName: string
- ward: string
- lastSeen: number (Date.now() — used to detect stale connections)
- isConnected: boolean

AlertRow:
- id: number
- bedId: string
- sessionId: string | null
- ts: string
- alertType: 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST' | 'BATTERY_LOW'
- resolvedAt: string | null
- resolvedBy: string | null

## 9. Error Debugging Guide

"No beds showing on dashboard":
- Dev mode (browser): Simulator should auto-start. Check console for [Mock Simulator] Starting...
- Tauri dev mode (no hardware): Click "Simulate Ward" in the sidebar
- Production with hardware: Settings → select correct COM port → click Connect Serial

"Build fails with TypeScript error":
- Almost always a type mismatch. Any value added to status in simulator.ts must exist in BedStatus in types.ts

"Build fails with 'Access is denied' (os error 5)":
- Windows Defender is blocking Rust compilation. Add src-tauri\target to Defender exclusions.

"App crashes on startup with PluginInitialization error":
- Invalid field in src-tauri/tauri.conf.json. Tauri validates config strictly.

"Infinite re-render / app freezes":
- A Zustand selector is returning a new object/array reference every render. Wrap in useMemo.

"Alerts not firing for a bed":
- The de-dup cache (LAST_ALERT) in alert.rs suppresses repeated alerts. Once bed recovers to STABLE, cache clears.

"Serial data not arriving":
- Verify COM port in Settings matches Device Manager
- Verify baud rate matches ESP32 firmware (typically 115200)
- Only one application can be connected to a COM port at a time

"MQTT not connecting":
- TLS config in mqtt.rs has empty certificate arrays. For AWS IoT Core production, load CA certificate, client cert, and private key files.

## 10. How to Run the Desktop App

Development:
  cd Desktop-App-Rust
  npm install
  npm run tauri dev

Production build:
  npm run tauri build
  Output installer: src-tauri/target/release/bundle/

First launch setup:
1. Go to Settings → select correct COM/tty port for USB receiver dongle
2. (Optional) Enter AWS IoT Core endpoint and certificate paths
3. Navigate to Dashboard — bed cards appear as ESP32 units come online

=== END DOCUMENT 2 ===


=== DOCUMENT 3: MOBILE APP CODEBASE GUIDE (smart-iv-mobile/mobile_codebase_guide.md) ===

# Smart IV Mobile — Comprehensive Codebase Guide

## 1. Technology Stack

- Framework: React Native managed by Expo (expo-router for file-based navigation, similar to Next.js)
- Language: TypeScript — strict type safety and reduced runtime bugs
- State Management: Zustand — lightweight, highly performant global state manager
- Real-time Communication (IoT): MQTT via aws-iot-device-sdk-v2 / mqtt.js — how the app receives instant updates from IV hardware
- Authentication: AWS Amplify — for logging in nurses and securing data
- HTTP Client: Axios — fetches historical data and acknowledges alerts via REST API endpoints
- UI/Visualization: react-native-chart-kit and react-native-svg for flow rate graphs

## 2. File and Folder Structure

The project follows strict separation of concerns, divided into app (Routing/Screens) and src (Logic/Components).

### The app/ Directory (Routing & Screens)
Using Expo Router, folder structure dictates the URL/Navigation structure.

- _layout.tsx: Root initialization file. Checks if user is logged in, initializes AWS Amplify sessions, sets up push notification handlers, connects to MQTT, redirects unauthenticated users to login screen.
- index.tsx: Blank fallback automatically redirected by _layout.tsx.
- (auth)/: Screens for unauthenticated users.
  - login.tsx: Login interface where nurses enter credentials.
- (app)/: Screens for authenticated users (the main app).
  - _layout.tsx: Layout wrapper for the main app.
  - ward.tsx: Primary dashboard showing all IV beds assigned to the logged-in nurse's ward.
  - alerts.tsx: Dedicated screen listing all active and historical alerts.
  - bed/[bedId].tsx: Dynamic route. Clicking on a bed opens this screen for detailed info (flow history graph, battery level, volume remaining) for that specific bed ID.

### The src/ Directory (Core Logic)

components/ — Reusable UI building blocks:
- AlertBanner.tsx: The red banner that drops down when an emergency occurs
- BedCard.tsx: Summary card for a single IV drip shown on the ward dashboard
- FlowChart.tsx: Line graph showing historical flow rate (Drops per minute)
- StatusBadge.tsx: Small pill-shaped badge showing "STABLE", "CRITICAL", etc.

services/ — The "Integration Layer" (how the app talks to the outside world):
- apiService.ts: All standard HTTP requests (fetching bed history, acknowledging alerts) using Axios. Injects auth token into requests.
- authService.ts: Wraps AWS Amplify functions. Handles login, logout, and token refreshing.
- mqttService.ts: THE MOST CRITICAL FILE for real-time data. Establishes persistent WebSocket connection to AWS IoT Core and listens for live hardware updates.
- notifService.ts: Manages Expo Push Notifications (so phones ring when app is closed).

stores/ — The "Memory Layer" (data currently being viewed):
- bedStore.ts: Holds live state of every IV bed (flow rate, battery, volume)
- alertStore.ts: Holds list of active alerts
- authStore.ts: Holds logged-in nurse's profile and JWT token

types/ — TypeScript interfaces (what a Bed or Alert object looks like)
constants/ — Hardcoded values (Colors, API URLs, MQTT Topic strings)

## 3. Architecture and Data Flow

### Phase 1: Hardware to Cloud
1. The physical Smart IV device detects a drop or a blockage.
2. The device publishes a JSON payload to AWS IoT Core via MQTT (e.g., topic: ward/ICU/flowrate).

### Phase 2: Cloud to Mobile App (Real-time)
1. When nurse logs in, app/_layout.tsx triggers useMqtt() → calls mqttService.connect().
2. The mobile app establishes a secure WebSocket connection to AWS IoT Core.
3. App subscribes to topics for the nurse's specific ward.
4. When AWS receives data from hardware, it instantly pushes it down the WebSocket to the mobile app.

### Phase 3: Processing in the App
1. Inside src/services/mqttService.ts, the client.on('message', ...) listener catches the incoming JSON.
2. The service parses the JSON and directly injects it into Zustand (useBedStore.getState().updateBed(...) or alertStore.addAlert(...)).

### Phase 4: Updating the UI
1. Zustand is a reactive state manager; any UI component "listening" to useBedStore (like BedCard.tsx or [bedId].tsx) instantly realizes the data changed.
2. React components automatically re-render in milliseconds. No manual refreshing required!

Note: apiService.ts is only used when the user first opens the app to get initial state, or to fetch past historical graph logs. Everything else is driven by MQTT.

## 4. How to Modify the App

### Changing the UI / Visuals
- Global colors: src/constants/colors.ts
- Specific widget: src/components/[ComponentName].tsx
- Whole screen layout: app/(app)/ward.tsx
- Method: Modify StyleSheet.create({...}) at the bottom of the respective file.

### Adding a New Hardware Sensor Feature (example: temperature sensor)
1. Types: Add temperature?: number to the Bed interface in src/types/bed.types.ts
2. State: Update src/stores/bedStore.ts to accept the new field
3. Data Flow: In src/services/mqttService.ts, in client.on('message') block, extract payload.temperature and pass it to bedStore update function
4. UI: Add text element in src/components/BedCard.tsx and app/(app)/bed/[bedId].tsx

### Modifying API / Cloud Connections
- New endpoint: Add to src/constants/api.ts
- Fetching logic: Add to src/services/apiService.ts
- Call from UI component's useEffect

## 5. Debugging Guide

1. "The UI looks wrong or the app crashes on a specific screen."
   - Cause: React rendering error or undefined variable
   - Fix: Check specific file in app/ or src/components/. Ensure optional chaining (nurse?.name instead of nurse.name).

2. "Numbers on screen aren't updating live when hardware runs."
   - Cause: MQTT connection failure or wrong topic subscription
   - Fix: Open src/services/mqttService.ts. Add console.log(topic, payload) inside client.on('message') block. If nothing logs, check AWS IoT endpoint in src/constants/mqtt.ts and verify ward name matches exactly.

3. "Getting network errors or 401 Unauthorized popups."
   - Cause: Axios failing to fetch initial data or AWS Amplify token expired
   - Fix: Check src/services/apiService.ts — look at apiClient.interceptors.response.use block. Verify API_BASE_URL in src/constants/api.ts.

4. "Push notifications aren't arriving."
   - Cause: Expo push token failed to register or backend is ignoring it
   - Fix: Look at src/services/notifService.ts. Ensure registerWithBackend() is successfully sending device token to your backend.

## 6. How to Run the Mobile App

  cd smart-iv-mobile
  npm install
  npx expo start         # or: npx react-native run-android / run-ios

Configure AWS Cognito User Pool ID and IoT endpoint in mobile/src/services/awsConfig.ts.

=== END DOCUMENT 3 ===
`;

/* =====================================================================
   SECTION 3 — SYSTEM PROMPT
   ===================================================================== */

const SYSTEM_PROMPT = `You are SmartIV Assistant, an expert AI guide for the SmartIV project — an IoT-powered IV drip monitoring system developed by Group 19 (E21 batch) at the Department of Computer Engineering, Faculty of Engineering, University of Peradeniya, Sri Lanka.

You have deep knowledge of this project based on the following documentation provided to you:

${CONTEXT_DOCS}

Your role:
- Answer questions about SmartIV clearly, accurately, and helpfully.
- Use only the information provided in the documentation above. Do not invent facts.
- If a question is outside the scope of what is documented, say so honestly and suggest what topic you can help with instead.
- Be conversational but precise. Use bullet points, bold text, and structure when it helps clarity.
- For code snippets, wrap them in markdown code blocks.
- Always be helpful about hardware, software, architecture, data flow, budget, team, testing, and how to run/modify the system.
- Keep responses focused and well-organized.`;

/* =====================================================================
   SECTION 4 — UI STATE
   ===================================================================== */

let conversationStarted = false;
const conversationHistory = []; // { role: 'user'|'model', parts: [{text}] }

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* =====================================================================
   SECTION 5 — GEMINI API CALL (with streaming)
   ===================================================================== */

async function callGeminiAPI(question) {
    // Build conversation history for Gemini API
    const contents = [
        ...conversationHistory,
        { role: 'user', parts: [{ text: question }] }
    ];

    const requestBody = {
        system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            topP: 0.95,
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
    };

    const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        let errorMsg = `Gemini API error (${response.status})`;
        try {
            const errJson = JSON.parse(errorBody);
            if (errJson.error && errJson.error.message) {
                errorMsg = errJson.error.message;
            }
        } catch (_) {}
        throw new Error(errorMsg);
    }

    return response; // Return the Response for streaming
}

/* =====================================================================
   SECTION 6 — DOM HELPERS
   ===================================================================== */

function getEl(id) { return document.getElementById(id); }

function renderUserBubble(text) {
    const container = getEl('cb-conv');
    const msg = document.createElement('div');
    msg.className = 'cb-msg user-msg';
    msg.innerHTML = `
        <div class="cb-msg-avatar"><i class="fas fa-user"></i></div>
        <div class="cb-msg-bubble">${escapeHtml(text)}</div>`;
    container.appendChild(msg);
    scrollToBottom();
}

function renderTyping() {
    const container = getEl('cb-conv');
    const wrap = document.createElement('div');
    wrap.className = 'cb-msg bot-msg';
    wrap.id = 'cb-typing-indicator';
    wrap.innerHTML = `
        <div class="cb-msg-avatar"><i class="fas fa-droplet"></i></div>
        <div class="cb-typing">
            <div class="cb-typing-dot"></div>
            <div class="cb-typing-dot"></div>
            <div class="cb-typing-dot"></div>
        </div>`;
    container.appendChild(wrap);
    scrollToBottom();
    return wrap;
}

function removeTyping() {
    const el = getEl('cb-typing-indicator');
    if (el) el.remove();
}

/**
 * Creates a bot message bubble and returns a function to append streamed text to it.
 */
function createStreamingBotBubble() {
    const container = getEl('cb-conv');
    const msg = document.createElement('div');
    msg.className = 'cb-msg bot-msg';

    const avatar = document.createElement('div');
    avatar.className = 'cb-msg-avatar';
    avatar.innerHTML = '<i class="fas fa-droplet"></i>';

    const bubble = document.createElement('div');
    bubble.className = 'cb-msg-bubble streaming-bubble';

    const content = document.createElement('div');
    content.className = 'streaming-content';
    bubble.appendChild(content);

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    container.appendChild(msg);
    scrollToBottom();

    // Returns a function to progressively update the bubble content
    return {
        appendText: (rawText) => {
            content.innerHTML = renderMarkdown(rawText);
            scrollToBottom();
        },
        finalize: () => {
            bubble.classList.remove('streaming-bubble');
        }
    };
}

/**
 * Renders markdown-ish text to HTML (bold, code, bullets, numbered lists, line breaks).
 */
function renderMarkdown(text) {
    // Escape HTML first
    let safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // Code blocks (``` ... ```)
    safe = safe.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="cb-code-block"><code>${code.trim()}</code></pre>`;
    });

    // Inline code (`code`)
    safe = safe.replace(/`([^`]+)`/g, '<code class="cb-inline-code">$1</code>');

    // Bold (**text** or __text__)
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic (*text* or _text_) — only single asterisk/underscore not followed by space
    safe = safe.replace(/\*([^\s*][^*]*?)\*/g, '<em>$1</em>');

    // Headers (## Heading, ### Heading)
    safe = safe.replace(/^### (.*?)$/gm, '<h4 class="cb-md-h4">$1</h4>');
    safe = safe.replace(/^## (.*?)$/gm, '<h3 class="cb-md-h3">$1</h3>');
    safe = safe.replace(/^# (.*?)$/gm, '<h2 class="cb-md-h2">$1</h2>');

    // Horizontal rule
    safe = safe.replace(/^---$/gm, '<hr class="cb-md-hr">');

    // Bullet list items (- item or • item)
    safe = safe.replace(/^[-•]\s+(.*?)$/gm, '<li class="cb-md-li">$1</li>');

    // Numbered list items (1. item)
    safe = safe.replace(/^\d+\.\s+(.*?)$/gm, '<li class="cb-md-li cb-md-li-num">$1</li>');

    // Wrap consecutive <li> items in a <ul>
    safe = safe.replace(/(<li class="cb-md-li">[^]*?<\/li>(\n|$))+/g, (match) => {
        return `<ul class="cb-md-ul">${match}</ul>`;
    });

    // Paragraphs: double newline → paragraph break
    safe = safe.replace(/\n\n+/g, '</p><p class="cb-md-p">');

    // Single newline → <br>
    safe = safe.replace(/\n/g, '<br>');

    return `<p class="cb-md-p">${safe}</p>`;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderErrorBubble(message) {
    const container = getEl('cb-conv');
    const msg = document.createElement('div');
    msg.className = 'cb-msg bot-msg';
    msg.innerHTML = `
        <div class="cb-msg-avatar" style="background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);color:#ef4444;">
            <i class="fas fa-triangle-exclamation"></i>
        </div>
        <div class="cb-msg-bubble cb-error-bubble">
            <strong>Error:</strong> ${escapeHtml(message)}
        </div>`;
    container.appendChild(msg);
    scrollToBottom();
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/* =====================================================================
   SECTION 7 — CONVERSATION FLOW (with streaming)
   ===================================================================== */

async function submitQuestion(question) {
    question = question.trim();
    if (!question) return;

    // Check if API key is configured
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_ACTUAL_API_KEY_HERE') {
        if (!conversationStarted) {
            conversationStarted = true;
            getEl('cb-landing').style.display = 'none';
            getEl('cb-conv').classList.add('active');
            getEl('cb-bottom-input-bar').classList.add('active');
        }
        renderUserBubble(question);
        clearInput();
        renderErrorBubble(
            'Gemini API key is not configured. Open docs/gemini_config.js and replace YOUR_ACTUAL_API_KEY_HERE with your key from https://aistudio.google.com/app/apikey'
        );
        return;
    }

    // Switch from landing to conversation view on first message
    if (!conversationStarted) {
        conversationStarted = true;
        getEl('cb-landing').style.display = 'none';
        getEl('cb-conv').classList.add('active');
        getEl('cb-bottom-input-bar').classList.add('active');
    }

    // Disable inputs while waiting
    setInputDisabled(true);

    // Render user message
    renderUserBubble(question);
    clearInput();

    // Show typing indicator
    renderTyping();

    // Add user message to history
    conversationHistory.push({ role: 'user', parts: [{ text: question }] });

    let fullResponseText = '';

    try {
        const response = await callGeminiAPI(question);

        // Remove typing indicator and create streaming bubble
        removeTyping();
        const { appendText, finalize } = createStreamingBotBubble();

        // Parse the SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const candidates = parsed.candidates;
                        if (candidates && candidates.length > 0) {
                            const parts = candidates[0].content?.parts;
                            if (parts && parts.length > 0) {
                                const chunk = parts[0].text || '';
                                fullResponseText += chunk;
                                appendText(fullResponseText);
                            }
                        }
                    } catch (parseErr) {
                        // Partial JSON chunk; skip
                    }
                }
            }
        }

        // Finalize the streaming bubble
        finalize();

        // Add assistant response to conversation history
        if (fullResponseText) {
            conversationHistory.push({
                role: 'model',
                parts: [{ text: fullResponseText }]
            });
        }

    } catch (err) {
        removeTyping();
        // Remove the user message from history on failure
        conversationHistory.pop();

        let errorMessage = 'Something went wrong while connecting to the AI. Please try again.';
        if (err.message) {
            errorMessage = err.message;
        }
        if (err.message && err.message.includes('API_KEY_INVALID')) {
            errorMessage = 'Your Gemini API key is invalid. Please check your key and try again.';
        }
        renderErrorBubble(errorMessage);
    }

    setInputDisabled(false);
    focusInput();
}

function setInputDisabled(disabled) {
    ['cb-main-input', 'cb-bottom-field'].forEach(id => {
        const el = getEl(id);
        if (el) el.disabled = disabled;
    });
    ['cb-main-send', 'cb-bottom-send'].forEach(id => {
        const el = getEl(id);
        if (el) el.disabled = disabled;
    });
}

function clearInput() {
    ['cb-main-input', 'cb-bottom-field'].forEach(id => {
        const el = getEl(id);
        if (el) el.value = '';
    });
}

function focusInput() {
    const el = getEl('cb-bottom-field') || getEl('cb-main-input');
    if (el) el.focus();
}

/* =====================================================================
   SECTION 8 — EVENT WIRING
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ── Main landing input ──
    const mainInput = getEl('cb-main-input');
    const mainSend  = getEl('cb-main-send');

    if (mainInput) {
        mainInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitQuestion(mainInput.value);
            }
        });
    }
    if (mainSend) {
        mainSend.addEventListener('click', () => submitQuestion(mainInput.value));
    }

    // ── Bottom sticky input (conversation mode) ──
    const bottomField = getEl('cb-bottom-field');
    const bottomSend  = getEl('cb-bottom-send');

    if (bottomField) {
        bottomField.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitQuestion(bottomField.value);
            }
        });
    }
    if (bottomSend) {
        bottomSend.addEventListener('click', () => submitQuestion(bottomField.value));
    }

    // ── Suggestion chips ──
    document.querySelectorAll('.cb-chip[data-question]').forEach(chip => {
        chip.addEventListener('click', () => {
            submitQuestion(chip.dataset.question);
        });
    });

    // ── Navbar scroll ──
    const cbNav = getEl('cb-navbar');
    if (cbNav) {
        window.addEventListener('scroll', () => {
            cbNav.classList.toggle('scrolled', window.scrollY > 60);
            const st = getEl('cb-scrolltop');
            if (st) st.classList.toggle('show', window.scrollY > 400);
        });
    }

    // ── Scroll-to-top ──
    const scrollTopBtn = getEl('cb-scrolltop');
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
        );
    }

    // ── Mobile nav ──
    const hamburger     = getEl('cb-hamburger');
    const mobileNav     = getEl('cb-mobile-nav');
    const mobileOverlay = getEl('cb-mobile-overlay');
    const mobileClose   = getEl('cb-mobile-close');

    if (hamburger) hamburger.addEventListener('click', openMobileMenu);
    if (mobileClose) mobileClose.addEventListener('click', closeMobileMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

    function openMobileMenu() {
        mobileNav?.classList.add('open');
        mobileOverlay?.classList.add('open');
    }
    function closeMobileMenu() {
        mobileNav?.classList.remove('open');
        mobileOverlay?.classList.remove('open');
    }

    // Auto-focus main input on load
    if (mainInput) mainInput.focus();
});
