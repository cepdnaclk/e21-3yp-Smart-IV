// ============================================================================
// Smart IV Bedside Unit Firmware - PlatformIO + Arduino framework + FreeRTOS
// ----------------------------------------------------------------------------
// Purpose:
//   - Read IR drop sensor robustly with debounce/plausibility filtering.
//   - Estimate flow rate in mL/hr from accepted drops.
//   - Track volume remaining from drop count and drop factor.
//   - Drive TMC2208 + NEMA17 as a clamp actuator using a task-based PID loop.
//   - Send the exact shared BedPacket JSON format over ESP-NOW to the receiver.
//
// Important prototype reality handled here:
//   1) IR sensor may generate false jumps -> we do our own edge counting and
//      reject physically impossible edges instead of trusting module counts.
//   2) Motor/3D clamp may not fully stop flow -> firmware detects saturation,
//      but DOES NOT invent unsupported dashboard status values such as HIGH_FLOW.
//      It still sends real flowRate so the desktop UI shows the deviation.
//
// Receiver must print raw JSON lines to USB serial for the desktop Rust parser.
// ============================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include <LiquidCrystal_I2C.h>

// --------------------------- Project identity -------------------------------
static const char *BED_ID = "03";
static char SESSION_ID[40] = "sess-03-prototype";

// Put the USB receiver ESP32 MAC address here.
// Example from receiver serial monitor: 24:6F:28:AA:BB:CC -> {0x24,0x6F,0x28,0xAA,0xBB,0xCC}
static uint8_t RECEIVER_MAC[6] = {0xAC, 0xA7, 0x04, 0x27, 0xB8, 0x38};  // TODO: replace
static const uint8_t ESPNOW_CHANNEL = 1;

// --------------------------- IV configuration -------------------------------
static constexpr float DEFAULT_TARGET_MLHR = 80.0f;
static constexpr float MAX_VOLUME_ML       = 500.0f;
static constexpr int   DROP_FACTOR         = 20;       // drops per mL
static constexpr float EMPTY_VOLUME_ML     = 3.0f;

// ------------------------------ Pin mapping ---------------------------------
// Based on your current connection list.
static constexpr int PIN_TMC_EN   = 27;  // TMC2208 EN, active LOW
static constexpr int PIN_TMC_STEP = 25;
static constexpr int PIN_TMC_DIR  = 26;
static constexpr int PIN_IR       = 34;  // receiver-only LM393 OUT
static constexpr int PIN_LCD_SDA = 21;
static constexpr int PIN_LCD_SCL = 22;

// Optional battery ADC. Leave -1 until you wire a divider from 2S battery to ADC.
// For 2S Li-ion, NEVER connect battery directly to ESP32 ADC. Use a divider.
static constexpr int PIN_BATTERY_ADC = -1; // e.g. 35 after adding divider

// --------------------------- LCD configuration ------------------------------
// For common 16x2 / 16x4 / 20x4 LCD backpacks using PCF8574.
// Most modules use 0x27; some use 0x3F. Run an I2C scanner if unsure.
static constexpr uint8_t LCD_I2C_ADDR = 0x27;
static constexpr uint8_t LCD_COLS = 16;   // change to 20 if using 20x4
static constexpr uint8_t LCD_ROWS = 4;    // change to 2 if using 16x2
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);
static bool lcdOk = false;

// --------------------------- Keypad configuration ---------------------------
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {13, 14, 16, 17};
byte colPins[COLS] = {4, 5, 18, 19};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
String keypadBuffer;

// --------------------------- Stepper/clamp config ---------------------------
// Soft-limit only. No limit switch exists, so start with clamp mechanically open.
static constexpr int32_t CLAMP_OPEN_STEPS   = 0;
static constexpr int32_t CLAMP_CLOSED_STEPS = 3200;  // tune experimentally
static constexpr uint16_t STEP_INTERVAL_US  = 900;   // ~1111 steps/s
static constexpr uint8_t STEP_PULSE_US      = 4;
static constexpr bool DIR_CLOSE_LEVEL       = HIGH;  // invert if motor direction is wrong

volatile int32_t currentClampSteps = CLAMP_OPEN_STEPS;
volatile int32_t targetClampSteps  = CLAMP_OPEN_STEPS;

// --------------------------- IR filtering config ----------------------------
// Tune this after observing real drops. 250 ms allows max 240 drops/min.
// Most normal IV rates are far slower, so this rejects bounce/noise bursts.
static constexpr uint32_t IR_MIN_EDGE_GAP_US       = 250000UL;
static constexpr uint32_t NO_FLOW_TIMEOUT_US       = 15000000UL;  // 15 s without accepted drop
static constexpr uint8_t  FLOW_WINDOW_SEC          = 20;          // smoothing window
static constexpr uint16_t CALIBRATION_MS           = 2500;
static constexpr uint16_t MAX_IDLE_TRANSITIONS_OK  = 8;

volatile uint32_t acceptedDropCount = 0;
volatile uint32_t lastAcceptedDropUs = 0;
volatile uint32_t lastIrEdgeUs = 0;

uint16_t dropBins[FLOW_WINDOW_SEC] = {0};
uint8_t binIndex = 0;

// ------------------------------- State model --------------------------------
enum BedStatus : uint8_t {
  STATUS_STABLE,
  STATUS_BLOCKAGE,
  STATUS_EMPTY_BAG,
  STATUS_CONN_LOST,
  STATUS_OFFLINE
};

const char *statusToString(BedStatus s) {
  switch (s) {
    case STATUS_STABLE:    return "STABLE";
    case STATUS_BLOCKAGE:  return "BLOCKAGE";
    case STATUS_EMPTY_BAG: return "EMPTY_BAG";
    case STATUS_CONN_LOST: return "CONN_LOST";
    case STATUS_OFFLINE:   return "OFFLINE";
    default:               return "STABLE";
  }
}

struct SystemState {
  bool sessionActive = false;
  bool sensorReady = false;
  bool sensorNoisy = false;
  bool controlSaturated = false;
  float targetMlhr = DEFAULT_TARGET_MLHR;
  float measuredMlhr = 0.0f;
  float measuredDpm = 0.0f;
  float volRemaining = MAX_VOLUME_ML;
  uint32_t sessionStartDrops = 0;
  uint32_t sessionDrops = 0;
  int batteryPct = 78;
  BedStatus status = STATUS_STABLE;
};

SystemState state;
SemaphoreHandle_t stateMutex;

// ------------------------------- PID state ----------------------------------
float pidIntegral = 0.0f;
float lastError = 0.0f;
uint32_t lastPidMs = 0;

// Conservative defaults. Tune after sensor is stable.
static constexpr float KP = 4.0f;       // steps per (mL/hr error)
static constexpr float KI = 0.035f;     // integral steps
static constexpr float KD = 1.2f;       // derivative damping
static constexpr float ERROR_DEADBAND_MLHR = 6.0f;
static constexpr float MAX_STEP_CHANGE_PER_CYCLE = 160.0f;

// --------------------------- ESP-NOW packet shape ---------------------------
#define MAX_PACKET_SIZE 256
typedef struct {
  char payload[MAX_PACKET_SIZE];
} ESPNowPacket;

// ------------------------------- Utilities ----------------------------------
uint32_t getAcceptedDropCountAtomic() {
  noInterrupts();
  uint32_t c = acceptedDropCount;
  interrupts();
  return c;
}

uint32_t getLastDropUsAtomic() {
  noInterrupts();
  uint32_t t = lastAcceptedDropUs;
  interrupts();
  return t;
}

void setClampTarget(int32_t steps) {
  steps = constrain(steps, CLAMP_OPEN_STEPS, CLAMP_CLOSED_STEPS);
  targetClampSteps = steps;
}

void generateSessionId() {
  uint32_t r = esp_random();
  snprintf(SESSION_ID, sizeof(SESSION_ID), "sess-%s-%08lx", BED_ID, (unsigned long)r);
}

int readBatteryPercent() {
  if (PIN_BATTERY_ADC < 0) return 78; // not wired yet

  // Example for future: 2S Li-ion via divider to ADC.
  // Tune R_TOP/R_BOTTOM to your real divider.
  static constexpr float R_TOP = 100000.0f;
  static constexpr float R_BOTTOM = 47000.0f;
  static constexpr float ADC_REF = 3.3f;
  static constexpr float ADC_MAX = 4095.0f;

  int raw = analogRead(PIN_BATTERY_ADC);
  float vAdc = (raw / ADC_MAX) * ADC_REF;
  float vBat = vAdc * ((R_TOP + R_BOTTOM) / R_BOTTOM);

  // 2S Li-ion approximate usable range: 6.4 V empty to 8.4 V full.
  int pct = (int)((vBat - 6.4f) * 100.0f / (8.4f - 6.4f));
  return constrain(pct, 0, 100);
}

// ----------------------------- IR interrupt ---------------------------------
void IRAM_ATTR onIrEdge() {
  uint32_t now = micros();
  uint32_t gap = now - lastIrEdgeUs;
  if (gap >= IR_MIN_EDGE_GAP_US) {
    acceptedDropCount++;
    lastAcceptedDropUs = now;
    lastIrEdgeUs = now;
  }
}

bool calibrateIrSensor() {
  detachInterrupt(digitalPinToInterrupt(PIN_IR));

  int previous = digitalRead(PIN_IR);
  uint16_t transitions = 0;
  uint32_t start = millis();

  while (millis() - start < CALIBRATION_MS) {
    int current = digitalRead(PIN_IR);
    if (current != previous) {
      transitions++;
      previous = current;
    }
    delay(2);
  }

  bool ok = transitions <= MAX_IDLE_TRANSITIONS_OK;

  xSemaphoreTake(stateMutex, portMAX_DELAY);
  state.sensorReady = ok;
  state.sensorNoisy = !ok;
  xSemaphoreGive(stateMutex);

  Serial.printf("[IR] Calibration transitions=%u -> %s\n", transitions, ok ? "OK" : "NOISY/UNSTABLE");

  // FALLING is typical for LM393 when beam is interrupted, but use RISING if your module is inverted.
  attachInterrupt(digitalPinToInterrupt(PIN_IR), onIrEdge, FALLING);
  return ok;
}

// ----------------------------- Session control ------------------------------
void resetSessionCounters() {
  uint32_t nowDrops = getAcceptedDropCountAtomic();
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  state.sessionStartDrops = nowDrops;
  state.sessionDrops = 0;
  state.volRemaining = MAX_VOLUME_ML;
  state.measuredMlhr = 0.0f;
  state.measuredDpm = 0.0f;
  state.status = STATUS_STABLE;
  state.controlSaturated = false;
  xSemaphoreGive(stateMutex);

  memset(dropBins, 0, sizeof(dropBins));
  binIndex = 0;
  pidIntegral = 0.0f;
  lastError = 0.0f;
}

void startSession() {
  generateSessionId();
  resetSessionCounters();
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  state.sessionActive = true;
  state.status = STATUS_STABLE;
  xSemaphoreGive(stateMutex);
  setClampTarget(CLAMP_OPEN_STEPS + 250); // begin slightly clamped; tune this
  Serial.printf("[SESSION] Started: %s\n", SESSION_ID);
}

void stopSessionAndClamp() {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  state.sessionActive = false;
  state.status = STATUS_STABLE;
  xSemaphoreGive(stateMutex);
  setClampTarget(CLAMP_CLOSED_STEPS);
  Serial.println("[SESSION] Stopped by user. Clamp closing.");
}

// ------------------------------- Tasks --------------------------------------
void sensorTask(void *pv) {
  uint32_t lastCount = getAcceptedDropCountAtomic();

  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(1000));

    uint32_t countNow = getAcceptedDropCountAtomic();
    uint16_t delta = (uint16_t)(countNow - lastCount);
    lastCount = countNow;

    dropBins[binIndex] = delta;
    binIndex = (binIndex + 1) % FLOW_WINDOW_SEC;

    uint32_t sumDrops = 0;
    for (uint8_t i = 0; i < FLOW_WINDOW_SEC; i++) sumDrops += dropBins[i];

    float dpm = (sumDrops * 60.0f) / FLOW_WINDOW_SEC;
    float mlhr = (dpm / (float)DROP_FACTOR) * 60.0f;

    uint32_t lastDrop = getLastDropUsAtomic();
    uint32_t nowUs = micros();
    bool noFlowTimeout = (lastDrop == 0) || ((uint32_t)(nowUs - lastDrop) > NO_FLOW_TIMEOUT_US);

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    uint32_t sessionDrops = countNow - state.sessionStartDrops;
    state.sessionDrops = sessionDrops;
    state.measuredDpm = dpm;
    state.measuredMlhr = mlhr;
    state.volRemaining = max(0.0f, MAX_VOLUME_ML - ((float)sessionDrops / (float)DROP_FACTOR));
    state.batteryPct = readBatteryPercent();

    if (state.sessionActive) {
      if (state.volRemaining <= EMPTY_VOLUME_ML) {
        state.status = STATUS_EMPTY_BAG;
      } else if (noFlowTimeout && state.volRemaining > EMPTY_VOLUME_ML) {
        // For this prototype, this means "no detected drops while liquid should remain".
        // It can be true blockage, sensor failure, or over-clamping. Check locally.
        state.status = STATUS_BLOCKAGE;
      } else {
        state.status = STATUS_STABLE;
      }
    }
    xSemaphoreGive(stateMutex);
  }
}

void controlTask(void *pv) {
  lastPidMs = millis();
  uint8_t saturatedHighFlowCycles = 0;

  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(2000));

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    bool active = state.sessionActive;
    bool sensorReady = state.sensorReady;
    bool sensorNoisy = state.sensorNoisy;
    BedStatus st = state.status;
    float measured = state.measuredMlhr;
    float target = state.targetMlhr;
    xSemaphoreGive(stateMutex);

    if (!active) {
      continue;
    }

    if (st == STATUS_EMPTY_BAG || st == STATUS_BLOCKAGE) {
      // Local safety action. Even if the clamp cannot fully stop flow, do the maximum closure.
      setClampTarget(CLAMP_CLOSED_STEPS);
      continue;
    }

    if (!sensorReady || sensorNoisy) {
      // Do not blindly PID-control using bad sensor data.
      continue;
    }

    uint32_t now = millis();
    float dt = max(0.001f, (now - lastPidMs) / 1000.0f);
    lastPidMs = now;

    // Positive error = flow too high -> close clamp more.
    float error = measured - target;

    if (fabs(error) < ERROR_DEADBAND_MLHR) {
      error = 0.0f;
    }

    pidIntegral += error * dt;
    pidIntegral = constrain(pidIntegral, -500.0f, 500.0f);
    float derivative = (error - lastError) / dt;
    lastError = error;

    float stepChange = KP * error + KI * pidIntegral + KD * derivative;
    stepChange = constrain(stepChange, -MAX_STEP_CHANGE_PER_CYCLE, MAX_STEP_CHANGE_PER_CYCLE);

    int32_t newTarget = targetClampSteps + (int32_t)stepChange;
    setClampTarget(newTarget);

    // Saturation awareness: clamp is fully closed but measured flow is still too high.
    if (targetClampSteps >= CLAMP_CLOSED_STEPS - 5 && measured > target * 1.20f) {
      saturatedHighFlowCycles++;
    } else {
      saturatedHighFlowCycles = 0;
    }

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    state.controlSaturated = saturatedHighFlowCycles >= 3;
    xSemaphoreGive(stateMutex);
  }
}

void stepperTask(void *pv) {
  pinMode(PIN_TMC_EN, OUTPUT);
  pinMode(PIN_TMC_STEP, OUTPUT);
  pinMode(PIN_TMC_DIR, OUTPUT);
  digitalWrite(PIN_TMC_EN, LOW);    // enable TMC2208
  digitalWrite(PIN_TMC_STEP, LOW);

  for (;;) {
    int32_t current = currentClampSteps;
    int32_t target = targetClampSteps;

    if (current == target) {
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    int direction = (target > current) ? 1 : -1;
    digitalWrite(PIN_TMC_DIR, direction > 0 ? DIR_CLOSE_LEVEL : !DIR_CLOSE_LEVEL);

    digitalWrite(PIN_TMC_STEP, HIGH);
    delayMicroseconds(STEP_PULSE_US);
    digitalWrite(PIN_TMC_STEP, LOW);
    delayMicroseconds(STEP_INTERVAL_US);

    currentClampSteps = current + direction;
  }
}

void commTask(void *pv) {
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(2000));

    SystemState snapshot;
    xSemaphoreTake(stateMutex, portMAX_DELAY);
    snapshot = state;
    xSemaphoreGive(stateMutex);

    StaticJsonDocument<256> doc;
    doc["bedId"] = BED_ID;
    doc["status"] = statusToString(snapshot.status);
    doc["flowRate"] = roundf(snapshot.measuredMlhr * 10.0f) / 10.0f;
    doc["volRemaining"] = roundf(snapshot.volRemaining * 10.0f) / 10.0f;
    doc["maxVolume"] = (int)MAX_VOLUME_ML;
    doc["battery"] = snapshot.batteryPct;
    doc["dropFactor"] = DROP_FACTOR;
    doc["targetMlhr"] = roundf(snapshot.targetMlhr * 10.0f) / 10.0f;
    doc["sessionId"] = SESSION_ID;

    char json[MAX_PACKET_SIZE];
    size_t len = serializeJson(doc, json, sizeof(json));
    if (len == 0 || len >= sizeof(json)) {
      Serial.println("[ERROR] JSON serialization failed or packet too large");
      continue;
    }

    ESPNowPacket packet;
    memset(&packet, 0, sizeof(packet));
    strncpy(packet.payload, json, MAX_PACKET_SIZE - 1);

    esp_err_t result = esp_now_send(RECEIVER_MAC, reinterpret_cast<uint8_t *>(&packet), sizeof(packet));

    // Debug copy on local USB. The receiver should output raw JSON to desktop.
    Serial.print("[TX] ");
    Serial.print(json);
    Serial.print(" espnow=");
    Serial.println(result == ESP_OK ? "OK" : "FAIL");
  }
}

void uiTask(void *pv) {
  for (;;) {
    char key = keypad.getKey();
    if (key) {
      if (key >= '0' && key <= '9') {
        keypadBuffer += key;
        if (keypadBuffer.length() > 4) keypadBuffer.remove(0, 1);
      } else if (key == '*') {
        keypadBuffer = "";
      } else if (key == '#') {
        int val = keypadBuffer.toInt();
        if (val >= 1 && val <= 500) {
          xSemaphoreTake(stateMutex, portMAX_DELAY);
          state.targetMlhr = (float)val;
          xSemaphoreGive(stateMutex);
          Serial.printf("[KEYPAD] Target set to %d mL/hr\n", val);
        }
        keypadBuffer = "";
      } else if (key == 'A') {
        startSession();
      } else if (key == 'B') {
        stopSessionAndClamp();
      } else if (key == 'C') {
        calibrateIrSensor();
      } else if (key == 'D') {
        resetSessionCounters();
        Serial.println("[KEYPAD] Session counters reset");
      }
    }

    if (lcdOk) {
      SystemState snapshot;
      xSemaphoreTake(stateMutex, portMAX_DELAY);
      snapshot = state;
      xSemaphoreGive(stateMutex);

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Bed ");
      lcd.print(BED_ID);
      lcd.print(" ");
      lcd.print(statusToString(snapshot.status));

      lcd.setCursor(0, 1);
      lcd.print("T:");
      lcd.print((int)snapshot.targetMlhr);
      lcd.print(" F:");
      lcd.print(snapshot.measuredMlhr, 1);

      if (LCD_ROWS >= 4) {
        lcd.setCursor(0, 2);
        lcd.print("Vol:");
        lcd.print(snapshot.volRemaining, 1);
        lcd.print("ml B:");
        lcd.print(snapshot.batteryPct);
        lcd.print("%");

        lcd.setCursor(0, 3);
        if (snapshot.sensorNoisy) lcd.print("IR NOISY ");
        else if (snapshot.controlSaturated) lcd.print("CLAMP LIMIT");
        else if (keypadBuffer.length()) {
          lcd.print("Input:");
          lcd.print(keypadBuffer);
        } else {
          lcd.print("A Start B Stop");
        }
      } else {
        // 16x2 fallback: rotate compact info on second row only.
        lcd.setCursor(0, 1);
        if (keypadBuffer.length()) {
          lcd.print("Input:");
          lcd.print(keypadBuffer);
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(120));
  }
}

// --------------------------- ESP-NOW setup ----------------------------------
void onEspNowSent(const uint8_t *mac, esp_now_send_status_t status) {
  // Keep quiet; commTask already prints status returned by esp_now_send().
  (void)mac;
  (void)status;
}

void setupEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(100);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  Serial.print("[ESP-NOW] Bedside MAC: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] Init failed. Rebooting in 3s.");
    delay(3000);
    ESP.restart();
  }

  esp_now_register_send_cb(onEspNowSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, RECEIVER_MAC, 6);
  peerInfo.channel = ESPNOW_CHANNEL;
  peerInfo.encrypt = false; // keep false for demo; enable PMK/LMK later if needed

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("[ESP-NOW] Failed to add receiver peer. Check RECEIVER_MAC.");
  } else {
    Serial.println("[ESP-NOW] Receiver peer added.");
  }
}

// -------------------------------- setup/loop --------------------------------
void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println("\n[BOOT] Smart IV bedside unit starting...");

  stateMutex = xSemaphoreCreateMutex();
  if (!stateMutex) {
    Serial.println("[FATAL] Failed to create state mutex");
    while (true) delay(1000);
  }

  pinMode(PIN_IR, INPUT);
  pinMode(PIN_TMC_EN, OUTPUT);
  pinMode(PIN_TMC_STEP, OUTPUT);
  pinMode(PIN_TMC_DIR, OUTPUT);
  digitalWrite(PIN_TMC_EN, LOW);

  Wire.begin(PIN_LCD_SDA, PIN_LCD_SCL);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SmartIV booting");
  lcd.setCursor(0, 1);
  lcd.print("Bed ");
  lcd.print(BED_ID);
  lcdOk = true;
  Serial.println("[LCD] Initialized. If blank, check contrast pot/address 0x27 vs 0x3F.");

  setupEspNow();
  calibrateIrSensor();
  generateSessionId();
  setClampTarget(CLAMP_OPEN_STEPS);

  // Core split: control/sensor/motor on core 1, communication/UI on core 0.
  xTaskCreatePinnedToCore(sensorTask,  "sensor",  4096, nullptr, 3, nullptr, 1);
  xTaskCreatePinnedToCore(controlTask, "control", 4096, nullptr, 3, nullptr, 1);
  xTaskCreatePinnedToCore(stepperTask, "stepper", 4096, nullptr, 4, nullptr, 1);
  xTaskCreatePinnedToCore(commTask,    "comm",    4096, nullptr, 2, nullptr, 0);
  xTaskCreatePinnedToCore(uiTask,      "ui",      4096, nullptr, 1, nullptr, 0);

  Serial.println("[BOOT] Ready.");
  Serial.println("[KEYPAD] A=start, B=stop/clamp, C=calibrate IR, D=reset volume, digits+#=target mL/hr");
}

void loop() {
  // Intentionally empty. Firmware is task-based under FreeRTOS.
  vTaskDelay(pdMS_TO_TICKS(1000));
}
