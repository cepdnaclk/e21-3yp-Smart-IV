SMART IV DEMO FIRMWARE — Arduino IDE Option 1
=============================================

Projects:
1) SmartIV_Demo_Receiver/SmartIV_Demo_Receiver.ino
   Upload to ESP32-S3-N16R8 receiver.

2) SmartIV_Demo_Bedside/SmartIV_Demo_Bedside.ino
   Upload to ESP32 DevKit V1 bedside unit.

REQUIRED ARDUINO LIBRARIES
--------------------------
Install from Arduino IDE Library Manager:
- LiquidCrystal_I2C
- Keypad

Receiver uses only ESP32 built-in WiFi/ESP-NOW libraries.

ARDUINO IDE BOARD SETTINGS
--------------------------
Receiver ESP32-S3-N16R8:
- Board: ESP32S3 Dev Module or ESP32S3 DevKitC-1
- Flash Size: 16MB
- PSRAM: Disabled is fine for receiver
- USB CDC On Boot: use the same setting that worked with your previous receiver demo
- Baud: 115200

Bedside ESP32 DevKit V1:
- Board: DOIT ESP32 DEVKIT V1 or ESP32 Dev Module
- Baud: 115200

IMPORTANT FOR DESKTOP APP
-------------------------
Receiver code has:
static const bool DEBUG_LOGS = false;
Keep it false when connecting to the Tauri desktop app.
The receiver prints RAW JSON only, no DATA: prefix.

DEMO WORKFLOW
-------------
1) Upload receiver code to ESP32-S3 receiver.
2) Connect receiver to laptop.
3) Open Serial Monitor at 115200 only for testing.
4) Upload bedside code to ESP32 DevKit V1.
5) Power bedside device.
6) On keypad:
   80#   -> set target flow = 80 mL/hr
   500D  -> set bag volume = 500 mL
   A     -> start session
   B     -> stop
   C     -> if running, toggle demo BLOCKAGE; if stopped/setup, reset IR counters
   *     -> clear typed input

7) For desktop app:
   Close Arduino Serial Monitor.
   Open Tauri desktop app.
   Connect to the receiver COM port at 115200.

EXPECTED JSON
-------------
{"bedId":"03","status":"STABLE","flowRate":80.2,"volRemaining":499.8,"maxVolume":500,"battery":78,"dropFactor":20,"targetMlhr":80.0,"sessionId":"sess-03-xxxxx"}

NOTES
-----
- If LCD backlight works but no text, try LCD_ADDR 0x3F instead of 0x27.
- If motor closes when it should open, flip DIR_CLOSE_LEVEL in bedside code.
- If IR is noisy, add a 10k resistor from IR OUT to 3.3V because GPIO34 has no internal pull-up.
- For tomorrow's demo, C can force a BLOCKAGE if the physical IR blockage detection is unreliable.

DESKTOP-SAFE PATCH IN THIS VERSION
----------------------------------
- Receiver DEBUG_LOGS is false by default.
- Bedside does NOT transmit SETUP packets. LCD can show SETUP locally, but desktop only receives valid BedPacket statuses after A/start.
- Before connecting Tauri desktop app, close Arduino Serial Monitor.
