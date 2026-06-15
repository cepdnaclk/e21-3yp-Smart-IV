// ============================================================
// SMART IV — DEMO BEDSIDE UNIT
// Board: ESP32 DevKit V1
// Tool: Arduino IDE
// Purpose:
//   Tomorrow-demo firmware with real keypad + I2C LCD + ESP-NOW
//   + demo-grade motor correction + hybrid IR flow sensing.
//
// DEMO WORKFLOW:
//   80#     -> set target flow to 80 mL/hr
//   500D    -> set IV bag volume to 500 mL
//   A       -> start / recover from blockage
//   B       -> stop
//   C       -> if SETUP/STOP: recalibrate IR; if RUNNING: toggle demo BLOCKAGE
//   *       -> clear typed input
//
// PACKET FORMAT:
//   Raw newline JSON is received by receiver and forwarded to Tauri desktop.
// ============================================================

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>

// -------------------- Identity / Receiver --------------------
static const char *BED_ID = "03";
static uint8_t RECEIVER_MAC[6] = {0xAC, 0xA7, 0x04, 0x27, 0xB8, 0x38};
static constexpr uint8_t ESPNOW_CHANNEL = 1;
static constexpr uint16_t MAX_JSON_LEN = 240;

// -------------------- LCD --------------------
// Most LCD backpacks are 0x27. If blank but backlight works, try 0x3F.
static constexpr uint8_t LCD_ADDR = 0x27;
static constexpr uint8_t LCD_COLS = 16;
static constexpr uint8_t LCD_ROWS = 4;   // change to 2 if using 16x2
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

// -------------------- Keypad --------------------
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
String typed = "";

// -------------------- Motor / TMC2208 --------------------
static constexpr int PIN_STEP = 25;
static constexpr int PIN_DIR  = 26;
static constexpr int PIN_EN   = 27;

// Flip this if motor direction is opposite.
static constexpr bool DIR_CLOSE_LEVEL = HIGH;
static constexpr bool DIR_OPEN_LEVEL  = !DIR_CLOSE_LEVEL;
static constexpr int CLAMP_OPEN_POS = 0;
static constexpr int CLAMP_CLOSED_POS = 3600;  // adjust for your physical mechanism
static int clampPos = 1200;                    // demo mid-position

static constexpr int CORRECTION_STEPS = 90;    // visible motor motion
static constexpr int STEP_DELAY_US = 650;
static constexpr unsigned long CONTROL_INTERVAL_MS = 1400;
static constexpr float FLOW_TOLERANCE_MLHR = 8.0f;

// -------------------- IR sensor --------------------
static constexpr int PIN_IR = 34;  // GPIO34 input-only; add external 10k pull-up if noisy
static constexpr unsigned long MIN_EDGE_GAP_US = 180000UL; // reject bounce faster than 180 ms
static constexpr unsigned long BLOCKAGE_TIMEOUT_MS = 12000UL;
static constexpr unsigned long REAL_SENSOR_VALID_AFTER_DROPS = 2;
#define IR_INTERRUPT_MODE FALLING  // try RISING if no drops are counted

volatile unsigned long isrLastEdgeUs = 0;
volatile unsigned long isrLastAcceptedUs = 0;
volatile unsigned long isrEmaIntervalUs = 0;
volatile unsigned long isrAcceptedDrops = 0;
volatile unsigned long isrRawEdges = 0;
volatile bool isrHasInterval = false;

void IRAM_ATTR irISR() {
  unsigned long now = micros();
  isrRawEdges++;
  if (now - isrLastEdgeUs < MIN_EDGE_GAP_US) return;
  isrLastEdgeUs = now;

  if (isrLastAcceptedUs > 0) {
    unsigned long interval = now - isrLastAcceptedUs;
    if (interval > MIN_EDGE_GAP_US) {
      if (!isrHasInterval) {
        isrEmaIntervalUs = interval;
        isrHasInterval = true;
      } else {
        isrEmaIntervalUs = (isrEmaIntervalUs * 3UL + interval) / 4UL;
      }
    }
  }
  isrLastAcceptedUs = now;
  isrAcceptedDrops++;
}

// -------------------- Infusion state --------------------
static constexpr int DROP_FACTOR = 20;   // drops/mL
float targetMlhr = 0.0f;
float maxVolumeMl = 0.0f;
float volRemainingMl = 0.0f;
float measuredFlowMlhr = 0.0f;
float realFlowMlhr = 0.0f;
float demoFlowMlhr = 0.0f;
int batteryPct = 78;

bool running = false;
bool forcedBlockage = false;
bool sensorNoisy = false;
bool realDropsSeen = false;
unsigned long sessionStartMs = 0;
unsigned long lastControlMs = 0;
unsigned long lastSendMs = 0;
unsigned long lastLcdMs = 0;
unsigned long lastVolumeMs = 0;
unsigned long lastNoiseCheckMs = 0;
unsigned long lastRawEdgesSnapshot = 0;
char sessionId[32] = "sess-03-demo";

String statusText = "SETUP";
String lastTxResult = "WAIT";

// -------------------- Helpers --------------------
void lcdPrintPadded(uint8_t col, uint8_t row, const String &text) {
  lcd.setCursor(col, row);
  String s = text;
  while (s.length() < LCD_COLS - col) s += ' ';
  if (s.length() > LCD_COLS - col) s = s.substring(0, LCD_COLS - col);
  lcd.print(s);
}

void moveStepper(bool closeDirection, int steps) {
  if (steps <= 0) return;
  digitalWrite(PIN_EN, LOW);  // TMC2208 enable is usually LOW
  digitalWrite(PIN_DIR, closeDirection ? DIR_CLOSE_LEVEL : DIR_OPEN_LEVEL);
  delayMicroseconds(20);
  for (int i = 0; i < steps; i++) {
    digitalWrite(PIN_STEP, HIGH);
    delayMicroseconds(STEP_DELAY_US);
    digitalWrite(PIN_STEP, LOW);
    delayMicroseconds(STEP_DELAY_US);
  }
}

void closeClampSteps(int steps) {
  int allowed = min(steps, CLAMP_CLOSED_POS - clampPos);
  if (allowed <= 0) return;
  moveStepper(true, allowed);
  clampPos += allowed;
}

void openClampSteps(int steps) {
  int allowed = min(steps, clampPos - CLAMP_OPEN_POS);
  if (allowed <= 0) return;
  moveStepper(false, allowed);
  clampPos -= allowed;
}

void resetIrStats() {
  noInterrupts();
  isrLastEdgeUs = 0;
  isrLastAcceptedUs = 0;
  isrEmaIntervalUs = 0;
  isrAcceptedDrops = 0;
  isrRawEdges = 0;
  isrHasInterval = false;
  interrupts();
  sensorNoisy = false;
  realDropsSeen = false;
  lastRawEdgesSnapshot = 0;
  lastNoiseCheckMs = millis();
  Serial.println("[IR] Recalibrated/reset counters");
}

void updateFlowEstimate() {
  unsigned long nowMs = millis();
  unsigned long acceptedDrops, lastAcceptedUs, emaIntervalUs, rawEdges;
  bool hasInterval;

  noInterrupts();
  acceptedDrops = isrAcceptedDrops;
  lastAcceptedUs = isrLastAcceptedUs;
  emaIntervalUs = isrEmaIntervalUs;
  rawEdges = isrRawEdges;
  hasInterval = isrHasInterval;
  interrupts();

  if (acceptedDrops >= REAL_SENSOR_VALID_AFTER_DROPS) realDropsSeen = true;

  // Noise check: too many raw transitions means LM393 output is chattering.
  if (nowMs - lastNoiseCheckMs >= 2000) {
    unsigned long deltaRaw = rawEdges - lastRawEdgesSnapshot;
    lastRawEdgesSnapshot = rawEdges;
    lastNoiseCheckMs = nowMs;
    if (deltaRaw > 25) sensorNoisy = true;
  }

  // Calculate real flow from EMA inter-drop interval.
  realFlowMlhr = 0.0f;
  if (hasInterval && emaIntervalUs > 0) {
    unsigned long nowUs = micros();
    if (nowUs - lastAcceptedUs <= BLOCKAGE_TIMEOUT_MS * 1000UL) {
      realFlowMlhr = 3600000000.0f / ((float)emaIntervalUs * (float)DROP_FACTOR);
    }
  }

  if (realFlowMlhr > 350.0f) sensorNoisy = true;

  // Demo fallback model: keeps demo alive if IR is unusable.
  if (running && !forcedBlockage) {
    float desired = targetMlhr;
    float motorEffect = ((float)(CLAMP_CLOSED_POS - clampPos) / (float)CLAMP_CLOSED_POS);
    float base = desired * (0.80f + 0.35f * motorEffect);
    float noise = (float)random(-30, 31) / 10.0f; // -3.0 to +3.0
    demoFlowMlhr += (base - demoFlowMlhr) * 0.18f;
    demoFlowMlhr += noise;
    if (demoFlowMlhr < 0) demoFlowMlhr = 0;
  } else if (!running || forcedBlockage) {
    demoFlowMlhr += (0.0f - demoFlowMlhr) * 0.35f;
    if (demoFlowMlhr < 0.5f) demoFlowMlhr = 0.0f;
  }

  bool realPlausible = (!sensorNoisy && realDropsSeen && realFlowMlhr >= 0.0f && realFlowMlhr <= 250.0f);

  if (forcedBlockage) {
    measuredFlowMlhr = 0.0f;
  } else if (realPlausible) {
    measuredFlowMlhr = realFlowMlhr;
  } else {
    measuredFlowMlhr = demoFlowMlhr;
  }

  // Real blockage detection only after real drops were seen before.
  if (running && realDropsSeen && !forcedBlockage) {
    unsigned long nowUs = micros();
    if (lastAcceptedUs > 0 && (nowUs - lastAcceptedUs) > BLOCKAGE_TIMEOUT_MS * 1000UL) {
      forcedBlockage = true;
      measuredFlowMlhr = 0.0f;
      Serial.println("[ALERT] BLOCKAGE detected: no drops after valid flow");
    }
  }
}

void updateStatus() {
  if (!running) {
    statusText = "SETUP";
    return;
  }
  if (volRemainingMl <= 1.0f) {
    statusText = "EMPTY_BAG";
    running = false;
    measuredFlowMlhr = 0.0f;
    return;
  }
  if (forcedBlockage) {
    statusText = "BLOCKAGE";
    return;
  }
  statusText = "STABLE";
}

void updateVolume() {
  unsigned long now = millis();
  if (lastVolumeMs == 0) lastVolumeMs = now;
  float dtHr = (float)(now - lastVolumeMs) / 3600000.0f;
  lastVolumeMs = now;

  if (running && statusText != "BLOCKAGE" && statusText != "EMPTY_BAG") {
    volRemainingMl -= measuredFlowMlhr * dtHr;
    if (volRemainingMl < 0) volRemainingMl = 0;
  }
}

void controlMotor() {
  if (!running || forcedBlockage || targetMlhr <= 0) return;
  unsigned long now = millis();
  if (now - lastControlMs < CONTROL_INTERVAL_MS) return;
  lastControlMs = now;

  float error = targetMlhr - measuredFlowMlhr;
  if (error > FLOW_TOLERANCE_MLHR) {
    // Flow too low -> loosen clamp / open
    openClampSteps(CORRECTION_STEPS);
    Serial.println("[CTRL] LOW FLOW -> OPEN clamp");
  } else if (error < -FLOW_TOLERANCE_MLHR) {
    // Flow too high -> pinch more / close
    closeClampSteps(CORRECTION_STEPS);
    Serial.println("[CTRL] HIGH FLOW -> CLOSE clamp");
  }
}

void sendPacket() {
  // Desktop-safe rule: do not transmit SETUP packets.
  // Tauri BedPacket status must be STABLE/BLOCKAGE/EMPTY_BAG/CONN_LOST/OFFLINE.
  // LCD can still show SETUP locally before the nurse starts the session.
  if (!running && statusText == "SETUP") return;

  unsigned long now = millis();
  if (now - lastSendMs < 1000) return;
  lastSendMs = now;

  char json[MAX_JSON_LEN];
  int n = snprintf(json, sizeof(json),
    "{\"bedId\":\"%s\",\"status\":\"%s\",\"flowRate\":%.1f,\"volRemaining\":%.1f,\"maxVolume\":%.0f,\"battery\":%d,\"dropFactor\":%d,\"targetMlhr\":%.1f,\"sessionId\":\"%s\"}",
    BED_ID, statusText.c_str(), measuredFlowMlhr, volRemainingMl, maxVolumeMl,
    batteryPct, DROP_FACTOR, targetMlhr, sessionId);

  if (n <= 0 || n >= (int)sizeof(json)) {
    Serial.println("[TX] JSON too long / snprintf failed");
    return;
  }

  esp_err_t result = esp_now_send(RECEIVER_MAC, (const uint8_t *)json, strlen(json) + 1);
  lastTxResult = (result == ESP_OK) ? "OK" : "FAIL";

  Serial.print("[TX] ");
  Serial.print(json);
  Serial.print(" espnow=");
  Serial.println(lastTxResult);
}

void updateLcd() {
  unsigned long now = millis();
  if (now - lastLcdMs < 350) return;
  lastLcdMs = now;

  String line0 = "Bed " + String(BED_ID) + " " + statusText;
  String line1 = "T:" + String(targetMlhr, 0) + " F:" + String(measuredFlowMlhr, 1);
  String line2 = "Vol:" + String(volRemainingMl, 1) + "ml";
  String line3;

  if (typed.length() > 0) {
    line3 = "Input:" + typed;
  } else if (sensorNoisy && running) {
    line3 = "IR NOISY TX:" + lastTxResult;
  } else if (!running) {
    line3 = "80# 500D A=Go";
  } else if (forcedBlockage) {
    line3 = "BLOCK! A recover";
  } else {
    line3 = "TX:" + lastTxResult + " Pos:" + String(clampPos);
  }

  lcdPrintPadded(0, 0, line0);
  lcdPrintPadded(0, 1, line1);
  if (LCD_ROWS >= 3) lcdPrintPadded(0, 2, line2);
  if (LCD_ROWS >= 4) lcdPrintPadded(0, 3, line3);
}

void startSession() {
  if (targetMlhr <= 0 || maxVolumeMl <= 0) {
    Serial.println("[START] Missing target or volume. Use 80# and 500D first.");
    return;
  }

  if (forcedBlockage) {
    forcedBlockage = false;
    Serial.println("[START] Recovered from forced blockage");
  }

  running = true;
  sessionStartMs = millis();
  lastVolumeMs = millis();
  snprintf(sessionId, sizeof(sessionId), "sess-%s-%lu", BED_ID, millis() % 100000UL);
  demoFlowMlhr = 0.0f;
  statusText = "STABLE";
  Serial.print("[START] Session started: ");
  Serial.println(sessionId);
}

void stopSession() {
  running = false;
  forcedBlockage = false;
  measuredFlowMlhr = 0.0f;
  demoFlowMlhr = 0.0f;
  statusText = "SETUP";
  Serial.println("[STOP] Session stopped");
}

void handleKeypad() {
  char key = keypad.getKey();
  if (!key) return;

  Serial.print("[KEY] ");
  Serial.println(key);

  if (key >= '0' && key <= '9') {
    if (typed.length() < 6) typed += key;
    return;
  }

  if (key == '*') {
    typed = "";
    return;
  }

  if (key == '#') {
    if (typed.length() > 0) {
      targetMlhr = typed.toFloat();
      Serial.print("[SET] targetMlhr=");
      Serial.println(targetMlhr);
      typed = "";
    }
    return;
  }

  if (key == 'D') {
    if (typed.length() > 0) {
      maxVolumeMl = typed.toFloat();
      volRemainingMl = maxVolumeMl;
      Serial.print("[SET] maxVolumeMl=");
      Serial.println(maxVolumeMl);
      typed = "";
    } else if (!running && maxVolumeMl > 0) {
      volRemainingMl = maxVolumeMl;
      Serial.println("[RESET] volume reset to maxVolumeMl");
    }
    return;
  }

  if (key == 'A') {
    startSession();
    return;
  }

  if (key == 'B') {
    stopSession();
    return;
  }

  if (key == 'C') {
    if (running) {
      forcedBlockage = !forcedBlockage;
      Serial.print("[DEMO] forcedBlockage=");
      Serial.println(forcedBlockage ? "ON" : "OFF");
    } else {
      resetIrStats();
    }
    return;
  }
}

void setupEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  delay(200);

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  Serial.print("[ESPNOW] Bedside MAC: ");
  Serial.println(WiFi.macAddress());
  Serial.print("[ESPNOW] Receiver MAC: AC:A7:04:27:B8:38, channel ");
  Serial.println(ESPNOW_CHANNEL);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESPNOW] init FAILED, restarting...");
    delay(1000);
    ESP.restart();
  }

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, RECEIVER_MAC, 6);
  peerInfo.channel = ESPNOW_CHANNEL;
  peerInfo.encrypt = false;

  esp_err_t addResult = esp_now_add_peer(&peerInfo);
  if (addResult == ESP_OK) {
    Serial.println("[ESPNOW] receiver peer added");
  } else if (addResult == ESP_ERR_ESPNOW_EXIST) {
    Serial.println("[ESPNOW] receiver peer already exists");
  } else {
    Serial.print("[ESPNOW] add peer failed code=");
    Serial.println(addResult);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("[BOOT] Smart IV DEMO bedside starting...");

  pinMode(PIN_EN, OUTPUT);
  pinMode(PIN_STEP, OUTPUT);
  pinMode(PIN_DIR, OUTPUT);
  digitalWrite(PIN_EN, LOW);
  digitalWrite(PIN_STEP, LOW);

  pinMode(PIN_IR, INPUT);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcdPrintPadded(0, 0, "Smart IV DEMO");
  lcdPrintPadded(0, 1, "Booting...");

  randomSeed(esp_random());
  setupEspNow();

  resetIrStats();
  attachInterrupt(digitalPinToInterrupt(PIN_IR), irISR, IR_INTERRUPT_MODE);

  lcd.clear();
  updateLcd();
  Serial.println("[BOOT] Ready. Use keypad: 80# 500D A");
}

void loop() {
  handleKeypad();
  updateFlowEstimate();
  updateStatus();
  updateVolume();
  controlMotor();
  updateLcd();
  sendPacket();
  delay(10);
}
