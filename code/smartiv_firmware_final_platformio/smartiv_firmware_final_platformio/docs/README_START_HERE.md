# SmartIV final PlatformIO firmware package

This package matches the current hardware split:

- **bedside-unit**: ESP32 DevKit V1, LCD backpack over I2C, keypad, IR sensor, TMC2208 motor driver.
- **receiver-dongle**: ESP32-S3-N16R8, ESP-NOW receiver, raw JSON output over USB serial for the desktop app.

## Receiver MAC already inserted

The bedside firmware already contains this receiver MAC address:

```cpp
static uint8_t RECEIVER_MAC[6] = {0xAC, 0xA7, 0x04, 0x27, 0xB8, 0x38};
```

## Upload order

1. Open `receiver-dongle/` in VS Code and upload it to the ESP32-S3-N16R8 receiver.
2. Open `bedside-unit/` in VS Code and upload it to the ESP32 DevKit V1 bedside board.
3. Keep the receiver connected to the laptop/desktop app. Power the bedside device separately.

## PlatformIO boards

### Bedside ESP32 DevKit V1

`bedside-unit/platformio.ini` uses:

```ini
board = esp32dev
```

### Receiver ESP32-S3-N16R8

`receiver-dongle/platformio.ini` defaults to:

```ini
board = esp32-s3-devkitc-1
board_build.flash_size = 16MB
board_build.partitions = default_16MB.csv
-DARDUINO_USB_MODE=1
-DARDUINO_USB_CDC_ON_BOOT=1
```

If the ESP32-S3 Serial Monitor stays blank because your board uses a separate UART/CH340 COM port, change:

```ini
default_envs = receiver_esp32s3_n16r8_usb_cdc
```

to:

```ini
default_envs = receiver_esp32s3_n16r8_uart
```

## Keypad workflow

The firmware no longer starts with a fake 500 mL bag and 80 mL/hr session.

Use this setup flow:

```text
80#     set target flow rate to 80 mL/hr
500D    set IV bag volume to 500 mL
C       recalibrate IR sensor after fixing alignment/noise
A       start session
B       stop session / close clamp
*       clear typed input
D       reset counters when no digits are typed
```

The session will not start until:

- target is set,
- bag volume is set,
- IR calibration is not noisy.

## ESP-NOW packet-size fix

Previous firmware could produce:

```text
ESPNOW: Invalid argument!
espnow=FAIL
```

The bedside sender now transmits only the real JSON length, not a padded 256-byte buffer. `MAX_PACKET_SIZE` is kept under the ESP-NOW payload limit.

## IR noise handling

If LCD shows `IR NOISY`, the firmware disables the IR interrupt and prevents fake flow/volume drain.

Fix physically first:

- align emitter and receiver,
- shield from room light,
- tune the LM393 potentiometer,
- add a 10k pull-up from OUT to 3.3V if GPIO34 is floating,
- press `C` to recalibrate.

## Desktop app serial output

The receiver prints raw JSON only when `RECEIVER_DEBUG=0`. This is required for the desktop parser.

Expected line:

```json
{"bedId":"03","status":"STABLE","flowRate":0,"volRemaining":500,"maxVolume":500,"battery":78,"dropFactor":20,"targetMlhr":80,"sessionId":"sess-03-xxxx"}
```
