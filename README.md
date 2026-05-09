# Smart IV — IoT Digital Co-Pilot for IV Drip Monitoring

> **"An IoT Digital Co-Pilot for Sustainable Healthcare"**
> 
> A 3rd Year Project · Group 19 · Department of Computer Engineering · Faculty of Engineering · University of Peradeniya

[![Project Website](https://img.shields.io/badge/Project%20Website-Live-brightgreen)](https://cepdnaclk.github.io/e21-3yp-Smart-IV/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-e21--3yp--Smart--IV-blue?logo=github)](https://github.com/cepdnaclk/e21-3yp-Smart-IV)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-ESP32%20%7C%20Tauri%20%7C%20React%20Native-orange)]()

---

## Table of Contents

1. [Overview](#overview)
2. [The Problem](#the-problem)
3. [Key Features](#key-features)
4. [System Architecture](#system-architecture)
5. [Hardware](#hardware)
6. [Software Stack](#software-stack)
7. [Data Flow](#data-flow)
8. [Control Algorithm](#control-algorithm)
9. [Safety & Resilience Design](#safety--resilience-design)
10. [Network & Security](#network--security)
11. [Repository Structure](#repository-structure)
12. [Getting Started](#getting-started)
13. [Testing](#testing)
14. [Budget](#budget)
15. [Team](#team)
16. [Supervisors](#supervisors)
17. [Acknowledgements](#acknowledgements)

---

## Overview

**Smart IV** is a compact, clip-on IoT retrofit device that transforms any standard gravity-drip IV set into a closed-loop smart infusion system — without replacing existing equipment or requiring proprietary consumables.

It targets the critical gap in healthcare infrastructure faced by general wards in developing nations: manual IV drips are cheap and universal, but dangerously unreliable, while commercial volumetric infusion pumps ($1,000–$5,000) are confined to the ICU. Smart IV bridges this gap at a fraction of the cost (~$120 USD / ~LKR 26,000 per unit).

Smart IV is **not** a replacement for nurses — it is a **digital co-pilot** that handles real-time monitoring, closed-loop flow regulation, and multi-channel alerting so nursing staff can focus on high-value patient care instead of repeatedly checking drip bags.

**Key stats from the problem space:**
- **79%** of manual gravity-led IV infusions deviate from the prescribed drop rate by over 20%
- **1 in 3** IV-related incidents occur due to delayed nurse response to drip completion
- Average nurse shift is **~8 hours**, during which dozens of IV bags must be monitored per ward

---

## The Problem

| | Manual IV Set (~$5) | Smart IV (~$120) | Volumetric Pump ($1,000–$5,000) |
|---|---|---|---|
| Flow control | ❌ Gravity only (open-loop) | ✅ Closed-loop PID | ✅ Precision peristaltic |
| Real-time monitoring | ❌ None | ✅ Continuous | ✅ Continuous |
| Alerts to nurses | ❌ None | ✅ Local + Remote | ✅ Local only |
| Retrofit-compatible | ✅ Standard IV sets | ✅ Standard IV sets | ❌ Proprietary sets |
| Suitable for general wards | ✅ Yes | ✅ Yes | ❌ ICU only |

**Real-world consequences of the gap:** documented cases of gangrene, amputation from extravasation events, and hospital legal actions — all from unmonitored IV administration in general wards.

---

## Key Features

- **Closed-Loop PID Flow Control** — IR drop sensor feedback drives a stepper motor to continuously correct flow rate to match the nurse's prescribed target (mL/hr)
- **Centralized Nurse Dashboard** — Desktop app monitors all ward beds simultaneously on a single screen with color-coded status badges (Stable / Warning / Alert)
- **Multi-Channel Alerting** — Anomaly detection fires safety interlocks locally on-device, visual alerts on dashboard, and push notifications to off-ward nurses via mobile app
- **Retrofit & Non-Invasive** — Clips onto any standard IV pole and drip set; no modifications to existing hospital infrastructure
- **Local-First Resilience** — Device continues infusing and alerting locally if Wi-Fi or cloud connectivity is lost; cloud is additive, not critical path
- **IoT-Enabled** — ESP-NOW edge mesh → UART/USB relay → MQTT over TLS → AWS IoT Core → React Native mobile app
- **Predictive Volume Tracking** — Counts every drop (with IR sensor) and subtracts from entered bag volume to compute time-to-empty in real time
- **Battery Backup** — Li-Ion UPS maintains continuous operation during mains power outages

---

## System Architecture

Smart IV uses a **3-tier IoT architecture**: Edge → Local Station → Cloud.

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 1 — EDGE LAYER (Bedside)                                   │
│                                                                  │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────┐    │
│  │  ESP32 Unit     │   │  ESP32 Unit     │   │  ESP32 Unit  │    │
│  │  (Bed 01)       │   │  (Bed 02)       │   │  (Bed N)     │    │
│  │  IR + PID Motor │   │  IR + PID Motor │   │  ...         │    │
│  └────────┬────────┘   └────────┬────────┘   └──────┬───────┘    │
│           │    ESP-NOW (encrypted, no router)       │            │
└───────────┼─────────────────────────────────────────┼────────────┘
            └──────────────────┬──────────────────────┘
                               │ ESP-NOW
┌──────────────────────────────▼────────────────────────────────────┐
│  TIER 2 — LOCAL STATION (Ward Level)                              │
│                                                                   │
│  ┌──────────────────┐    USB/UART  ┌──────────────────────┐     │
│  │  ESP32 Receiver  │ ────────────▶│  Nurse Station PC    │     │
│  │  (USB Dongle)    │               │  Tauri + React App   │     │
│  └──────────────────┘               │  SQLite DB           │     │
│                                     │  Alert Rule Engine   │     │
│                                     └───────────┬──────────┘     │
└─────────────────────────────────────────────────┼────────────────┘
                                                  │ MQTT over TLS
┌─────────────────────────────────────────────────▼────────────────┐
│  TIER 3 — CLOUD LAYER (Remote Access)                            │
│                                                                  │
│  ┌──────────────┐  Rule Engine  ┌──────────┐  Push  ┌────────┐   │
│  │ AWS IoT Core │ ────────────▶ │  Lambda  │──────▶│  SNS   │ │
│  └──────────────┘               └──────────┘        └───┬────┘   │
│  ┌──────────────┐               ┌──────────┐            │        │
│  │  DynamoDB    │               │ Cognito  │            │        │
│  │  (optional)  │               │ Auth     │            │        │
│  └──────────────┘               └──────────┘            │        │
│                                                          ▼       │
│                                             ┌─────────────────┐  │
│                                             │ React Native    │  │
│                                             │ Mobile App      │  │
│                                             └─────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Hardware

### Components (per bedside unit)

| # | Component | Model / Notes | Unit Price (LKR) |
|---|-----------|---------------|-----------------|
| 1 | Primary MCU | ESP32-S3 Development Board | 2,150.00 |
| 2 | Secondary MCU (USB Dongle) | ESP32 DevKit V1 | 1,835.00 |
| 3 | Stepper Motor (actuator) | NEMA 17 Bipolar | 2,240.00 |
| 4 | Motor Driver | TMC2208 Silent Driver | 1,390.00 |
| 5 | Display | Arduino LCD + Logic Level Converter | 1,950.00 |
| 6 | Input | 4×4 Keypad Module + Buttons | 820.00 |
| 7 | Drop Sensor | IR Speed Sensor Module LM393 | 150.00 |
| 8 | Power Supply | WX-DC2412 Switching Module | 2,950.00 |
| 9 | Battery UPS | 2× 18650 Cells + Holder + BMS | 1,305.00 |
| 10 | Voltage Regulator | Buck Converter + Cover | 300.00 |
| 11 | Testing | Standard IV sets (×3) + NaCl bags (×4) | 1,258.08 |
| 12 | Chassis | 3D Injection Moulded Enclosure | 5,000.00 |
| 13 | Alert | Buzzer | 55.00 |
| 14 | Misc | PCBs, Screws, Bearings, Connectors | 4,820.00 |
| | **Total per unit** | | **LKR 26,223.08 (~$120 USD)** |

### Physical Design

- Clips onto any standard IV pole — no infrastructure changes
- LCD display: target flow rate (mL/hr), infusion status, volume remaining
- Physical controls: Start / Change / Stop
- Li-Ion UPS for uninterrupted operation during power outages
- Custom PCB for a compact, production-ready form factor

### Sensors & Actuation

**IR Optical Drop Sensor (LM393)**
Counts drips passing through the drip chamber. Drops Per Minute (DPM) is the real-time feedback signal for the PID controller. Two sensors provide redundancy.

**NEMA 17 Stepper Motor + TMC2208 Driver**
Acts as the flow actuator by precisely compressing or releasing the IV tube clamp. The PID control signal maps to step frequency, which translates directly to tube compression and thus flow rate.

**ESP32 Dual-Core Usage**
- Core 1: PID control loop + sensor reading + safety interlocks (uninterrupted)
- Core 0: ESP-NOW wireless communication (isolated from motor control path)

---

## Software Stack

| Layer | Technology |
|---|---|
| Firmware | ESP32 (Arduino / ESP-IDF), ESP-NOW |
| Desktop App | Tauri 2 (Rust backend) + React (TypeScript frontend) |
| Desktop DB | SQLite via `sqlx` |
| Cloud Messaging | MQTT over TLS (`rumqttc`) → AWS IoT Core |
| Cloud Compute | AWS Lambda |
| Cloud Notifications | AWS SNS |
| Cloud Auth | AWS Cognito |
| Mobile App | React Native (iOS & Android) |

### Desktop App — Tauri + React

```
smart-iv-desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri app entry, task orchestration
│   │   ├── serial.rs        # Serial port listener (serialport crate)
│   │   ├── db.rs            # SQLite via sqlx — schema + queries
│   │   ├── mqtt.rs          # MQTT publisher (rumqttc) with TLS
│   │   ├── alert.rs         # Alert rule engine (blockage, empty, battery)
│   │   └── commands.rs      # Tauri IPC commands exposed to React
│   └── Cargo.toml
├── src/
│   ├── store/
│   │   ├── bedsStore.ts     # Zustand slice — live bed state
│   │   └── alertStore.ts    # Zustand slice — active alerts
│   ├── components/
│   │   ├── BedCard.tsx      # Per-bed status card
│   │   ├── WardGrid.tsx     # Responsive ward-level grid
│   │   └── AlertBanner.tsx  # Top-of-screen alert strip
│   ├── pages/
│   │   ├── Dashboard.tsx    # Live monitoring view
│   │   ├── History.tsx      # Session + telemetry history
│   │   └── Settings.tsx     # Serial port, MQTT config
│   └── lib/
│       └── tauriEvents.ts   # listen() wrappers for Tauri events
└── package.json
```

### SQLite Schema

```sql
-- Static config per physical device
CREATE TABLE beds (
  bed_id       TEXT PRIMARY KEY,   -- e.g. "03"
  patient_name TEXT,
  ward         TEXT,
  drop_factor  INTEGER DEFAULT 20,
  mac_address  TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per infusion session
CREATE TABLE sessions (
  session_id    TEXT PRIMARY KEY,   -- UUID generated on desktop
  bed_id        TEXT REFERENCES beds(bed_id),
  max_volume_ml REAL NOT NULL,
  target_ml_hr  REAL NOT NULL,
  started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at      DATETIME,
  end_reason    TEXT    -- 'COMPLETED' | 'CANCELLED' | 'ERROR'
);

-- Telemetry ring buffer (last 7 days, purged on startup)
CREATE TABLE telemetry (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  bed_id         TEXT REFERENCES beds(bed_id),
  session_id     TEXT REFERENCES sessions(session_id),
  ts             DATETIME DEFAULT CURRENT_TIMESTAMP,
  flow_rate_ml   REAL,
  vol_remaining  REAL,
  battery_pct    INTEGER,
  status         TEXT    -- 'STABLE' | 'BLOCKAGE' | 'EMPTY' | 'CONN_LOST'
);

-- Audit log for every alert event
CREATE TABLE alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  bed_id      TEXT REFERENCES beds(bed_id),
  session_id  TEXT,
  ts          DATETIME DEFAULT CURRENT_TIMESTAMP,
  alert_type  TEXT,   -- 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST' | 'BATTERY_LOW'
  resolved_at DATETIME,
  resolved_by TEXT    -- nurse login name
);

CREATE INDEX idx_telemetry_bed_ts ON telemetry(bed_id, ts DESC);
CREATE INDEX idx_alerts_unresolved ON alerts(resolved_at) WHERE resolved_at IS NULL;
```

### Rust Crates (Cargo.toml)

```toml
[dependencies]
tauri          = { version = "2", features = ["shell-open"] }
sqlx           = { version = "0.7", features = ["sqlite", "runtime-tokio"] }
serialport     = "4"
rumqttc        = "0.24"
serde          = { version = "1", features = ["derive"] }
serde_json     = "1"
tokio          = { version = "1", features = ["full"] }
uuid           = { version = "1", features = ["v4"] }
```

---

## Data Flow

### End-to-End: Physical Drop → Nurse Alert

**1. Sense (Edge)**

IR sensor counts drops in the drip chamber → computes real-time Drops Per Minute (DPM).

Volume remaining is tracked by:
```
vol_remaining = max_volume - (drops_counted / drop_factor)
```

**2. Compute & Control (ESP32 Core 1)**

PID controller runs on every sensor reading:
```
Error  e(t)  = Target_DPM − Measured_DPM
Output u(t)  = Kp·e(t) + Ki·∫e(t)dt + Kd·de(t)/dt
Stepper step_freq ← f(u(t))
```

Anomaly detection:
```
IF measured_DPM == 0:
  IF vol_remaining > 0  → FLAG: BLOCKAGE
  IF vol_remaining == 0 → FLAG: EMPTY_BAG
```

**3. Transmit (Edge → Station, ESP-NOW)**

ESP32 Core 0 independently sends data packets (CCMP-encrypted, no Wi-Fi router needed):

```json
{
  "bedId": "03",
  "status": "STABLE",
  "flowRate": 80.5,
  "volRemaining": 423.75,
  "maxVolume": 500,
  "battery": 87,
  "dropFactor": 20,
  "targetMlhr": 80.0,
  "sessionId": "uuid-here"
}
```

Typical latency: ~1–5 ms.

**4. Relay (Station — USB Dongle → Nurse PC)**

ESP32 Receiver Node (USB-connected to Nurse PC) forwards the serial stream via UART. The Tauri backend parses the JSON stream continuously on a dedicated `tokio::spawn` thread.

**5. Display (Nurse Dashboard)**

React frontend receives `bed-update` Tauri events and updates Zustand store in real time:

```ts
listen<BedPacket>('bed-update', ({ payload }) => {
  useBedsStore.getState().upsertBed(payload);
});
```

Ward grid shows one card per bed: patient name, bed number, flow rate (mL/hr), volume remaining (mL), battery %, status badge.

**6. Escalate (Station → Cloud, MQTT/AWS IoT Core)**

Alert events are published to structured MQTT topics (QoS 1, TLS):

```
smartiv/{ward}/{bed_id}/telemetry   ← continuous telemetry
smartiv/{ward}/{bed_id}/alert       ← alert events only
```

AWS IoT Rule SQL filter:
```sql
SELECT *, topic(2) as ward, topic(3) as bedId
FROM 'smartiv/+/+/alert'
WHERE status <> 'STABLE'
```

This triggers a Lambda → SNS push notification to mobile subscribers.

**7. Alert (Cloud → Mobile App)**

React Native app receives push notifications for off-ward nurses and doctors. AWS Cognito provides role-based access control (Nurse / Ward Sister / Admin). Live bed status is available remotely via the mobile app.

---

## Control Algorithm

Smart IV implements **PID (Proportional-Integral-Derivative)** closed-loop flow control:

```
┌──────────────┐   e(t)   ┌─────────┐  u(t)  ┌───────────────┐
│  Setpoint    │ ────────▶ │   PID   │ ──────▶ │ Stepper Motor │
│  (Target DPM)│    +      │  Block  │        │ (Clamp Ctrl)  │
└──────────────┘    ▲      └─────────┘        └───────┬───────┘
                    │ (-)                              │
                    │                      ┌───────────▼───────────┐
                    └──────────────────────│   IR Drop Sensor       │
                                          │   (Measured DPM)       │
                                          └───────────────────────┘
```

This is the same closed-loop control principle used in high-end volumetric infusion pumps — implemented on commodity ESP32 hardware at a fraction of the cost.

---

## Safety & Resilience Design

### Safety Interlock Table

| Scenario | Immediate Response | Cloud Required? |
|---|---|---|
| Tube Blockage | Stop motor immediately + LCD alert + Dashboard alert (Red) | ❌ No |
| Empty Bag | Emergency clamp (motor closes tube fully) + Dashboard alert | ❌ No |
| Wi-Fi / Cloud Loss | Continue infusion normally + LCD local alert | — |
| Desktop Connection Loss | Continue infusion + LCD alert | ❌ No |
| Mains Power Outage | Li-Ion UPS maintains full operation | ❌ No |
| Low Battery | Dashboard yellow warning + mobile push notification | Optional |

All critical safety responses execute **locally on the ESP32** with zero cloud round-trip latency. Cloud alerting is additive and never on the critical path.

### Fail-Safe Architecture

The Rust backend structures the serial reader and MQTT publisher as **independent `tokio::spawn` tasks** with separate error boundaries. MQTT reconnect failures never block the serial ingestion or dashboard update path. Failed alert payloads are buffered in memory for retry.

---

## Network & Security

| Layer | Protocol | Encryption | Infrastructure Needed |
|---|---|---|---|
| Edge → Station | ESP-NOW | CCMP (AES-128 equivalent) | None — no router |
| Station → Cloud | MQTT over TLS | TLS transport layer | Wi-Fi / LAN |
| Cloud → Mobile | HTTPS / WebSocket | TLS | Internet |
| Mobile Auth | AWS Cognito | JWT / OAuth 2.0 | Internet |

**Data Minimization:** Only the necessary telemetry fields are transmitted at each layer.

**Access Control:** AWS Cognito user pools enforce role separation between nurses, ward sisters, and administrators in the mobile app.

---

## Repository Structure

```
e21-3yp-Smart-IV/
├── firmware/                    # ESP32 firmware
│   ├── bedside-unit/            # Edge device (ESP32-S3)
│   │   ├── src/
│   │   │   ├── main.cpp
│   │   │   ├── pid_controller.cpp
│   │   │   ├── ir_sensor.cpp
│   │   │   ├── stepper_motor.cpp
│   │   │   ├── espnow_comm.cpp
│   │   │   └── safety_interlocks.cpp
│   │   └── platformio.ini
│   └── receiver-dongle/         # USB receiver node (ESP32)
│       ├── src/
│       │   ├── main.cpp
│       │   └── serial_relay.cpp
│       └── platformio.ini
│
├── desktop/                     # Tauri + React nurse station app
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── serial.rs
│   │   │   ├── db.rs
│   │   │   ├── mqtt.rs
│   │   │   ├── alert.rs
│   │   │   └── commands.rs
│   │   └── Cargo.toml
│   ├── src/
│   │   ├── store/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/
│   └── package.json
│
├── mobile/                      # React Native nurse/doctor app
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── services/            # AWS IoT / Cognito integrations
│   │   └── store/
│   └── package.json
│
├── hardware/                    # PCB design & mechanical files
│   ├── pcb/                     # KiCad / EasyEDA project files
│   ├── enclosure/               # 3D model files (.step / .stl)
│   └── schematics/              # Circuit schematics (PDF)
│
├── cloud/                       # AWS infrastructure
│   ├── iot-rules/               # IoT Core rule definitions
│   ├── lambda/                  # Lambda function source
│   └── terraform/               # (optional) Infrastructure as Code
│
├── docs/                        # Project documentation
│   ├── architecture/
│   ├── testing-reports/
│   └── images/
│
└── README.md
```

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Rust | ≥ 1.77 | Tauri backend |
| Node.js | ≥ 18 | React frontend |
| PlatformIO | Latest | ESP32 firmware |
| Python | ≥ 3.10 | PlatformIO toolchain |
| SQLite | ≥ 3.39 | Local database |

### 1. Clone the Repository

```bash
git clone https://github.com/cepdnaclk/e21-3yp-Smart-IV.git
cd e21-3yp-Smart-IV
```

### 2. Flash Firmware

**Bedside Unit (ESP32-S3):**
```bash
cd firmware/bedside-unit
pio run --target upload
```

**Receiver Dongle (ESP32 DevKit V1):**
```bash
cd firmware/receiver-dongle
pio run --target upload
```

> Configure your MAC addresses and target DPM defaults in `firmware/bedside-unit/src/config.h` before flashing.

### 3. Run the Desktop App (Development)

```bash
cd desktop
npm install
npm run tauri dev
```

On first launch:
1. Go to **Settings** → select the correct COM/tty port for the USB receiver dongle
2. (Optional) Enter AWS IoT Core endpoint and certificate paths for cloud alerting
3. Navigate to **Dashboard** — bed cards appear automatically as ESP32 units come online

### 4. Build the Desktop App (Production)

```bash
npm run tauri build
```

Output installer is placed in `src-tauri/target/release/bundle/`.

### 5. Run the Mobile App

```bash
cd mobile
npm install
npx expo start      # or: npx react-native run-android / run-ios
```

> Configure your AWS Cognito User Pool ID and IoT endpoint in `mobile/src/services/awsConfig.ts`.

### 6. AWS Cloud Setup

```
AWS IoT Core
  ├── Create a Thing (one per nurse station/ward)
  ├── Attach Certificate + Policy (iot:Connect, iot:Publish, iot:Subscribe)
  ├── IoT Rule: filter on 'smartiv/+/+/alert' WHERE status <> 'STABLE'
  │     └── Action: Invoke Lambda
  └── (Optional) IoT Rule: filter on '/telemetry' → DynamoDB

Lambda
  └── Execution role: SNS:Publish permission
  └── Publishes formatted alert to SNS Topic: smartiv-alerts

SNS
  └── Subscriptions: mobile app (via AWS Amplify push)

Cognito
  └── User Pool: nurse/doctor logins
  └── Identity Pool: mobile ↔ IoT Core subscription
```

---

## Testing

| Test Area | Test | Status |
|---|---|---|
| Hardware | IR drop sensor accuracy vs known flow rates | ✅ Validated |
| Hardware | Stepper motor precision & flow regulation accuracy | ✅ Validated |
| Hardware | Wi-Fi connectivity & MQTT transmission reliability | ✅ Validated |
| Hardware | Battery life under continuous operation | 🔄 In Progress |
| Hardware | Performance in hospital temperature/humidity | 🔄 In Progress |
| Software | Unit tests — all backend API endpoints | ✅ Validated |
| Software | Integration: hardware → MQTT → backend → mobile | ✅ Validated |
| Software | Alert delivery latency (target: <3 seconds) | ✅ Validated |
| Software | Load test — 20+ simultaneous devices | 🔄 In Progress |
| Software | User acceptance testing with nursing staff | 📋 Planned |

---

## Budget

**Total estimated hardware cost per unit: LKR 26,223.08 (~$120 USD)**

This is under 6% of the cost of a commercial volumetric infusion pump ($1,000–$5,000), making Smart IV viable for deployment across all beds in general wards.

Cloud hosting and software development costs are separate and scale with ward size.

---

## Team

| Name | Registration | GitHub | LinkedIn |
|---|---|---|---|
| Pavindran V. | E/21/283 | [@pavindranvelalagan](https://github.com/pavindranvelalagan/) | [LinkedIn](https://www.linkedin.com/in/pavindran-velalagan-404646214/) |
| Shagiththiah K. | E/21/375 | [@shagiththiah](https://github.com/shagiththiah) | [LinkedIn](https://www.linkedin.com/in/shagiththiah-kirupakaran-608457254/) |
| Suthail A.L.M | E/21/395 | [@EngSuthail](https://github.com/EngSuthail) | [LinkedIn](https://www.linkedin.com/in/suthail-latheef-84a5892b3/) |
| Paarkavi J. | E/21/206 | [@paarkavi29](https://github.com/paarkavi29) | [LinkedIn](https://www.linkedin.com/in/paarkavi-jeyatheeswaran-ab8541321/) |

---

## Supervisors

| Name | Title |
|---|---|
| **Ms. Yasodha Vimukthi** | Lecturer, Department of Computer Engineering, University of Peradeniya |
| **Dr. Isuru Nawinne** | Senior Lecturer, Department of Computer Engineering, University of Peradeniya |

---

## Acknowledgements

- Department of Computer Engineering, Faculty of Engineering, University of Peradeniya
- SLIoT Challenge — for recognition as finalists
- Open-source communities behind ESP-IDF, Tauri, React Native, and the Rust async ecosystem

---

## Useful Links

- 🌐 [Project Website](https://cepdnaclk.github.io/e21-3yp-Smart-IV/)
- 💻 [GitHub Repository](https://github.com/cepdnaclk/e21-3yp-Smart-IV)
- 🏫 [Department of Computer Engineering, UoP](https://www.ce.pdn.ac.lk/)
- 🎓 [Faculty of Engineering, UoP](https://eng.pdn.ac.lk/)
- 📦 [Other E21 Batch 3YP Projects](https://projects.ce.pdn.ac.lk/3yp/e21/)

---

> © 2025 Smart IV — Group 19, Department of Computer Engineering, University of Peradeniya. All rights reserved.