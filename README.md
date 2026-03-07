# SMART IV 
**University of Peradeniya - Computer Engineering 3rd Year Project (Team 19)**

> **CURRENT STATUS: INITIAL DEVELOPMENT**  
> *We are currently in the initial hardware prototyping and software scaffolding phase. The Desktop Dashboard is under active development using simulated (mock) serial data while the physical ESP32 USB receiver and bedside units are being built.*

---

##  The Vision

### The Healthcare Gap
Currently, hospitals face a significant gap in intravenous (IV) therapy management:
* **Manual IV Sets:** Universal and low cost (~$5), but rely on open-loop gravity flow. This lacks feedback mechanisms, leading to risks like occlusions, free-flow, and severe clinical complications.
* **Volumetric Infusion Pumps:** Highly precise with closed-loop mechanisms, but prohibitively expensive ($1,000 – $5,000) and require proprietary consumables.

### Our Solution
**Smart IV** is the "missing middle ground." It is a low-cost, retrofit controller designed to attach to standard, existing IV sets. By utilizing a **PID-controlled mechanism** and a **stepper motor**, it continuously calculates flow errors to stabilize IV delivery—bringing ICU-level safety and automation to general hospital wards.



---

##  Planned System Architecture

Our system is designed across a three-tier hierarchy to ensure reliability and real-time monitoring:

1.  **Edge Layer (Bedside):** ESP32 units equipped with IR drop counters and stepper motors to regulate flow. Data is transmitted locally via **ESP-NOW**.
2.  **Local Station (Nurse PC):** A central ESP32 receiver relays data via UART to a **Desktop Dashboard (Electron/React)** for centralized, multi-patient monitoring.
3.  **Cloud Layer (Remote):** **AWS IoT Core** integration to trigger remote mobile alerts via a **React Native** application for on-call staff.



---

##  Repository Structure

```text
e21-3yp-Smart-IV/
├── smart-iv-dashboard/     # (ACTIVE) Electron + React.js Nurse Station Desktop App
├── hardware/               # (PLANNED) C/C++ Firmware for ESP32 Bedside Units
├── mobile-app/             # (PLANNED) React Native Application 
└── mechanics/              # (PLANNED) 3D Printing / CAD files for chassis
Running the Desktop Dashboard (Development Mode)
Since the hardware is currently under construction, the Electron app uses a mockSerialService to generate simulated patient data for UI/UX testing.

Prerequisites
Node.js (v18+)

npm

Setup & Run
Bash
# 1. Navigate to the dashboard directory
cd smart-iv-dashboard

# 2. Install dependencies
npm install

# 3. Start the application
npm run dev
