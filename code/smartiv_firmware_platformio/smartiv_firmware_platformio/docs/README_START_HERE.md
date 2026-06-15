# Smart IV Firmware — PlatformIO Start Guide

This package contains two PlatformIO projects:

```text
smartiv_firmware_platformio/
├── bedside-unit/      # ESP32 on the IV stand: IR + motor + OLED + keypad + ESP-NOW sender
└── receiver-dongle/   # ESP32 plugged into nurse-station PC: ESP-NOW receiver -> USB serial JSON
```

## 1. Why this uses PlatformIO + Arduino framework

PlatformIO is the build/upload environment. The firmware still uses the Arduino framework because it gives you fast access to ESP-NOW, OLED, keypad, and JSON libraries. It is **not** a single-loop Arduino sketch: the code uses FreeRTOS tasks pinned across ESP32 cores.

Tasks in the bedside unit:

- `sensorTask` — IR drop counting, filtering, flow/volume estimation
- `controlTask` — PID clamp control and safety decisions
- `stepperTask` — TMC2208 STEP/DIR pulse generation
- `commTask` — shared JSON packet generation and ESP-NOW transmit
- `uiTask` — OLED + keypad handling

## 2. Install and open

1. Install VS Code.
2. Install the PlatformIO extension.
3. Open `smartiv_firmware_platformio/bedside-unit` as a PlatformIO project.
4. Open `smartiv_firmware_platformio/receiver-dongle` separately when flashing the receiver.

## 3. First flash the receiver

1. Open `receiver-dongle`.
2. Upload to the ESP32 that will be connected to the laptop/desktop station.
3. Temporarily set `DEBUG_LOGS = true` in `receiver-dongle/src/main.cpp` and open Serial Monitor.
4. Copy the printed MAC address.
5. Set `DEBUG_LOGS = false` again before using it with the desktop app.

The receiver prints raw JSON lines only, for example:

```json
{"bedId":"03","status":"STABLE","flowRate":82.4,"volRemaining":312.5,"maxVolume":500,"battery":78,"dropFactor":20,"targetMlhr":80,"sessionId":"sess-abc"}
```

Do not print `DATA:` unless the desktop Rust serial parser strips it.

## 4. Then flash the bedside unit

1. Open `bedside-unit/src/main.cpp`.
2. Replace `RECEIVER_MAC` with the receiver MAC address.
3. Confirm pin mappings match your wiring.
4. Upload.
5. Open Serial Monitor at `115200`.

Keypad controls:

- `A` — start a new session
- `B` — stop session and close clamp
- `C` — recalibrate IR sensor
- `D` — reset drop/volume counters
- digits then `#` — set target flow in mL/hr, e.g. `80#`
- `*` — clear typed digits

## 5. IR sensor calibration notes

At boot, keep the drip chamber still and avoid drops crossing the beam for ~2.5 seconds. The firmware counts idle transitions:

- low transition count = sensor stable
- high transition count = noisy/unstable sensor alignment

The firmware rejects edges that are too close together using `IR_MIN_EDGE_GAP_US`. This directly addresses the false jump problem where the reading appears like 0, 1, 2, 5, 10, 50, 100.

Tune these constants in `bedside-unit/src/main.cpp`:

```cpp
IR_MIN_EDGE_GAP_US
FLOW_WINDOW_SEC
NO_FLOW_TIMEOUT_US
```

## 6. Motor/clamp tuning notes

Because your current clamp cannot always fully stop flow, the firmware treats the motor as a **bounded actuator**, not a guaranteed shutoff valve.

Tune these constants:

```cpp
CLAMP_CLOSED_STEPS
STEP_INTERVAL_US
KP
KI
KD
ERROR_DEADBAND_MLHR
```

Start with the clamp mechanically open before powering the ESP32, because there is no limit switch or encoder. The firmware uses only soft limits.

## 7. Desktop compatibility

The transmitted JSON fields are exactly:

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

Supported statuses are kept to the desktop/mobile enum:

```text
STABLE, BLOCKAGE, EMPTY_BAG, CONN_LOST, OFFLINE
```

Do not add new values such as `HIGH_FLOW` unless you also update the desktop and mobile type definitions and alert logic.
