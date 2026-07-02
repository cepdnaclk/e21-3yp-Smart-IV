// ============================================================
// SMART IV — DEMO BEDSIDE UNIT
// Board: ESP32 DevKit V1
// Tool: Arduino IDE
// Purpose:
//   Demo firmware with real keypad + I2C LCD + ESP-NOW
//   + demo-grade motor correction + polling-based IR drop sensing.
//
// IMPORTANT DEMO BEHAVIOR:
//   - No valid IR drops = flowRate 0.0 by default.
//   - IR is detected using polling, not interrupt edge detection.
//   - Demo flow fallback is available only when physical F3 is pressed while running.
//   - Receiver output remains Tauri-compatible through ESP-NOW JSON packets.
//
// PHYSICAL KEYPAD USAGE AFTER YOUR KEY-MAPPING:
//   80 + F2      -> set target flow to 80 mL/hr
//   500 + F3     -> set IV bag volume to 500 mL
//   F4           -> start / recover
//   STOP         -> stop
//   F2 while run -> toggle demo BLOCKAGE fallback
//   F3 while run -> toggle DEMO FLOW assist fallback
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
static constexpr uint8_t LCD_ADDR = 0x27;
static constexpr uint8_t LCD_COLS = 16;
static constexpr uint8_t LCD_ROWS = 4;
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

// -------------------- Keypad correction --------------------
char translateDemoKey(char raw) {
  switch (raw) {
    case '1': return 'A';   // physical F4 = START / RECOVER
    case '2': return 'D';   // physical F3 = SET VOLUME / DEMO FLOW TOGGLE
    case '3': return '#';   // physical F2 = SET TARGET / BLOCKAGE TOGGLE
    case '4': return 'B';   // physical STOP = STOP

    case '#': return '4';   // physical 4
    case '9': return '5';   // physical 5
    case '6': return '6';   // physical 6
    case '0': return '7';   // physical 7
    case '8': return '8';   // physical 8
    case '5': return '9';   // physical 9
    case '7': return '0';   // physical 0

    case '*': return '*';
    case 'A': return '1';
    case 'B': return '2';
    case 'C': return '3';
    case 'D': return 'C';

    default: return raw;
  }
}

// -------------------- Motor / TMC2208 --------------------
static constexpr int PIN_STEP = 25;
static constexpr int PIN_DIR  = 26;
static constexpr int PIN_EN   = 27;

// Flip this if motor direction is opposite.
static constexpr bool DIR_CLOSE_LEVEL = LOW;
static constexpr bool DIR_OPEN_LEVEL  = !DIR_CLOSE_LEVEL;

static constexpr int CLAMP_OPEN_POS = 0;
static constexpr int CLAMP_CLOSED_POS = 3600;
static int clampPos = 1200;

static constexpr int CORRECTION_STEPS = 90;
static constexpr int STEP_DELAY_US = 650;
static constexpr unsigned long CONTROL_INTERVAL_MS = 1400;
static constexpr float FLOW_TOLERANCE_MLHR = 8.0f;

// -------------------- IR sensor --------------------
static constexpr int PIN_IR = 34;  // GPIO34 input-only; add external 10k pull-up if possible

// For real drop interval filtering.
static constexpr unsigned long MIN_EDGE_GAP_US = 180000UL;

// If no drop after valid flow for this time, trigger blockage.
static constexpr unsigned long BLOCKAGE_TIMEOUT_MS = 12000UL;

// Need at least 2 drops to calculate interval-based flow.
static constexpr unsigned long REAL_SENSOR_VALID_AFTER_DROPS = 2;

// Polling-based drop detection.
// The firmware learns the idle level, then counts one drop when the signal moves away from idle.
bool irIdleLevel = HIGH;
bool irWasActive = false;
unsigned long lastAcceptedDropMs = 0;
static constexpr unsigned long MIN_DROP_GAP_MS = 300;

// These keep old variable names, but now polling updates them.
volatile unsigned long isrLastEdgeUs = 0;
volatile unsigned long isrLastAcceptedUs = 0;
volatile unsigned long isrEmaIntervalUs = 0;
volatile unsigned long isrAcceptedDrops = 0;
volatile unsigned long isrRawEdges = 0;
volatile bool isrHasInterval = false;

// -------------------- Infusion state --------------------
static constexpr int DROP_FACTOR = 20;

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

// Default OFF.
// OFF: no valid IR drops = flowRate 0.0.
// ON: demo fallback flow is allowed for emergency demo safety.
bool demoAssistEnabled = false;

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

  digitalWrite(PIN_EN, LOW);
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

// -------------------- IR polling --------------------
bool readStableIrLevel() {
  int highCount = 0;

  for (int i = 0; i < 25; i++) {
    if (digitalRead(PIN_IR) == HIGH) {
      highCount++;
    }
    delay(2);
  }

  return highCount >= 13 ? HIGH : LOW;
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
  realFlowMlhr = 0.0f;
  measuredFlowMlhr = 0.0f;

  lastRawEdgesSnapshot = 0;
  lastNoiseCheckMs = millis();

  irIdleLevel = readStableIrLevel();
  irWasActive = false;
  lastAcceptedDropMs = 0;

  Serial.print("[IR] Idle level learned = ");
  Serial.println(irIdleLevel ? "HIGH" : "LOW");

  Serial.println("[IR] Recalibrated/reset counters");
}

void pollIrDrop() {
  bool level = digitalRead(PIN_IR);
  bool active = (level != irIdleLevel);
  unsigned long nowMs = millis();

  // Count only when the IR signal changes state.
  if (active != irWasActive) {
    isrRawEdges++;

    // Count one drop only on idle -> active.
    if (active) {
      if (nowMs - lastAcceptedDropMs >= MIN_DROP_GAP_MS) {
        unsigned long nowUs = micros();

        if (isrLastAcceptedUs > 0) {
          unsigned long interval = nowUs - isrLastAcceptedUs;

          if (interval > MIN_EDGE_GAP_US) {
            if (!isrHasInterval) {
              isrEmaIntervalUs = interval;
              isrHasInterval = true;
            } else {
              isrEmaIntervalUs = (isrEmaIntervalUs * 3UL + interval) / 4UL;
            }
          }
        }

        isrLastAcceptedUs = nowUs;
        isrAcceptedDrops++;
        lastAcceptedDropMs = nowMs;

        Serial.print("[DROP] accepted=");
        Serial.print(isrAcceptedDrops);
        Serial.print(" level=");
        Serial.print(level ? "HIGH" : "LOW");
        Serial.print(" idle=");
        Serial.println(irIdleLevel ? "HIGH" : "LOW");
      }
    }

    irWasActive = active;
  }
}

// -------------------- Flow estimation --------------------
void updateFlowEstimate() {
  unsigned long nowMs = millis();

  unsigned long acceptedDrops;
  unsigned long lastAcceptedUs;
  unsigned long emaIntervalUs;
  unsigned long rawEdges;
  bool hasInterval;

  noInterrupts();
  acceptedDrops = isrAcceptedDrops;
  lastAcceptedUs = isrLastAcceptedUs;
  emaIntervalUs = isrEmaIntervalUs;
  rawEdges = isrRawEdges;
  hasInterval = isrHasInterval;
  interrupts();

  if (acceptedDrops >= REAL_SENSOR_VALID_AFTER_DROPS) {
    realDropsSeen = true;
  }

  // Noise check: too many transitions means LM393 output is chattering.
  if (nowMs - lastNoiseCheckMs >= 2000) {
    unsigned long deltaRaw = rawEdges - lastRawEdgesSnapshot;

    lastRawEdgesSnapshot = rawEdges;
    lastNoiseCheckMs = nowMs;

    if (deltaRaw > 25) {
      sensorNoisy = true;
      Serial.print("[IR] Noisy raw transitions in 2s = ");
      Serial.println(deltaRaw);
    }
  }

  // Calculate real flow from EMA inter-drop interval.
  realFlowMlhr = 0.0f;

  if (hasInterval && emaIntervalUs > 0) {
    unsigned long nowUs = micros();

    if (nowUs - lastAcceptedUs <= BLOCKAGE_TIMEOUT_MS * 1000UL) {
      realFlowMlhr = 3600000000.0f / ((float)emaIntervalUs * (float)DROP_FACTOR);
    }
  }

  if (realFlowMlhr > 350.0f) {
    sensorNoisy = true;
    realFlowMlhr = 0.0f;
  }

  // Demo fallback model.
  // Calculated always, but used ONLY if demoAssistEnabled = true.
  if (running && !forcedBlockage) {
    float desired = targetMlhr;

    // clampPos = 0 means open, clampPos = CLAMP_CLOSED_POS means closed.
    float openRatio = 1.0f - ((float)clampPos / (float)CLAMP_CLOSED_POS);

    if (openRatio < 0.0f) openRatio = 0.0f;
    if (openRatio > 1.0f) openRatio = 1.0f;

    float base = desired * (0.55f + 0.65f * openRatio);
    float noise = (float)random(-20, 21) / 10.0f;

    demoFlowMlhr += (base - demoFlowMlhr) * 0.16f;
    demoFlowMlhr += noise;

    if (demoFlowMlhr < 0.0f) demoFlowMlhr = 0.0f;
  } else {
    demoFlowMlhr += (0.0f - demoFlowMlhr) * 0.35f;

    if (demoFlowMlhr < 0.5f) {
      demoFlowMlhr = 0.0f;
    }
  }

  bool realPlausible =
    (!sensorNoisy &&
     realDropsSeen &&
     realFlowMlhr >= 1.0f &&
     realFlowMlhr <= 250.0f);

  if (forcedBlockage) {
    measuredFlowMlhr = 0.0f;
  } else if (realPlausible) {
    measuredFlowMlhr = realFlowMlhr;
  } else if (demoAssistEnabled && running) {
    measuredFlowMlhr = demoFlowMlhr;
  } else {
    measuredFlowMlhr = 0.0f;
  }

  // Real blockage detection only after valid real drops have been seen.
  if (running && realDropsSeen && !forcedBlockage) {
    unsigned long nowUs = micros();

    if (lastAcceptedUs > 0 &&
        (nowUs - lastAcceptedUs) > BLOCKAGE_TIMEOUT_MS * 1000UL) {
      forcedBlockage = true;
      measuredFlowMlhr = 0.0f;
      Serial.println("[ALERT] BLOCKAGE detected: no drops after valid flow");
    }
  }
}

// -------------------- State / volume / control --------------------
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

  if (lastVolumeMs == 0) {
    lastVolumeMs = now;
  }

  float dtHr = (float)(now - lastVolumeMs) / 3600000.0f;
  lastVolumeMs = now;

  if (running && statusText != "BLOCKAGE" && statusText != "EMPTY_BAG") {
    volRemainingMl -= measuredFlowMlhr * dtHr;

    if (volRemainingMl < 0.0f) {
      volRemainingMl = 0.0f;
    }
  }
}

void controlMotor() {
  if (!running || forcedBlockage || targetMlhr <= 0.0f) return;

  unsigned long now = millis();

  if (now - lastControlMs < CONTROL_INTERVAL_MS) return;

  lastControlMs = now;

  float error = targetMlhr - measuredFlowMlhr;

  if (error > FLOW_TOLERANCE_MLHR) {
    openClampSteps(CORRECTION_STEPS);
    Serial.println("[CTRL] LOW FLOW -> OPEN clamp");
  } else if (error < -FLOW_TOLERANCE_MLHR) {
    closeClampSteps(CORRECTION_STEPS);
    Serial.println("[CTRL] HIGH FLOW -> CLOSE clamp");
  }
}

// -------------------- ESP-NOW packet --------------------
void sendPacket() {
  // Desktop-safe rule: do not transmit SETUP packets.
  if (!running && statusText == "SETUP") return;

  unsigned long now = millis();

  if (now - lastSendMs < 1000) return;

  lastSendMs = now;

  char json[MAX_JSON_LEN];

  int n = snprintf(
    json,
    sizeof(json),
    "{\"bedId\":\"%s\",\"status\":\"%s\",\"flowRate\":%.1f,\"volRemaining\":%.1f,\"maxVolume\":%.0f,\"battery\":%d,\"dropFactor\":%d,\"targetMlhr\":%.1f,\"sessionId\":\"%s\"}",
    BED_ID,
    statusText.c_str(),
    measuredFlowMlhr,
    volRemainingMl,
    maxVolumeMl,
    batteryPct,
    DROP_FACTOR,
    targetMlhr,
    sessionId
  );

  if (n <= 0 || n >= (int)sizeof(json)) {
    Serial.println("[TX] JSON too long / snprintf failed");
    return;
  }

  esp_err_t result = esp_now_send(
    RECEIVER_MAC,
    (const uint8_t *)json,
    strlen(json) + 1
  );

  lastTxResult = (result == ESP_OK) ? "OK" : "FAIL";

  Serial.print("[TX] ");
  Serial.print(json);
  Serial.print(" espnow=");
  Serial.println(lastTxResult);
}

// -------------------- LCD --------------------
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
  } else if (!running) {
    line3 = "80F2 500F3 F4";
  } else if (forcedBlockage) {
    line3 = "BLOCK! F4 recov";
  } else if (demoAssistEnabled) {
    line3 = "DEMO FLOW TX:" + lastTxResult;
  } else if (sensorNoisy) {
    line3 = "IR NOISY F=0";
  } else if (!realDropsSeen) {
    line3 = "WAIT DROPS TX:" + lastTxResult;
  } else {
    line3 = "TX:" + lastTxResult + " Pos:" + String(clampPos);
  }

  lcdPrintPadded(0, 0, line0);
  lcdPrintPadded(0, 1, line1);

  if (LCD_ROWS >= 3) {
    lcdPrintPadded(0, 2, line2);
  }

  if (LCD_ROWS >= 4) {
    lcdPrintPadded(0, 3, line3);
  }
}

// -------------------- Session control --------------------
void startSession() {
  if (targetMlhr <= 0.0f || maxVolumeMl <= 0.0f) {
    Serial.println("[START] Missing target or volume. Use 80F2 and 500F3 first.");
    return;
  }

  if (forcedBlockage) {
    forcedBlockage = false;
    Serial.println("[START] Recovered from forced blockage");
  }

  resetIrStats();

  running = true;
  demoAssistEnabled = false;

  sessionStartMs = millis();
  lastVolumeMs = millis();

  snprintf(sessionId, sizeof(sessionId), "sess-%s-%lu", BED_ID, millis() % 100000UL);

  demoFlowMlhr = 0.0f;
  measuredFlowMlhr = 0.0f;
  realFlowMlhr = 0.0f;

  statusText = "STABLE";

  Serial.print("[START] Session started: ");
  Serial.println(sessionId);
}

void stopSession() {
  running = false;
  forcedBlockage = false;
  demoAssistEnabled = false;

  measuredFlowMlhr = 0.0f;
  realFlowMlhr = 0.0f;
  demoFlowMlhr = 0.0f;

  statusText = "SETUP";

  Serial.println("[STOP] Session stopped");
}

// -------------------- Keypad --------------------
void handleKeypad() {
  char raw = keypad.getKey();

  if (!raw) return;

  char key = translateDemoKey(raw);

  Serial.print("[KEY] raw=");
  Serial.print(raw);
  Serial.print(" mapped=");
  Serial.println(key);

  if (key >= '0' && key <= '9') {
    if (typed.length() < 6) {
      typed += key;
    }
    return;
  }

  if (key == '*') {
    typed = "";
    return;
  }

  if (key == '#') {
    if (running) {
      forcedBlockage = !forcedBlockage;

      Serial.print("[DEMO] forcedBlockage=");
      Serial.println(forcedBlockage ? "ON" : "OFF");

      return;
    }

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
    } else if (running) {
      demoAssistEnabled = !demoAssistEnabled;

      Serial.print("[DEMO] demoAssistEnabled=");
      Serial.println(demoAssistEnabled ? "ON" : "OFF");
    } else if (!running && maxVolumeMl > 0.0f) {
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

// -------------------- ESP-NOW setup --------------------
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

// -------------------- Arduino setup / loop --------------------
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

  lcd.clear();
  updateLcd();

  Serial.println("[BOOT] Ready. Use keypad: 80F2 500F3 F4");
}

void loop() {
  handleKeypad();

  // Polling IR detection is more reliable here because the LM393 LED blink is visibly long.
  pollIrDrop();

  updateFlowEstimate();
  updateStatus();
  updateVolume();
  controlMotor();
  updateLcd();
  sendPacket();

  delay(10);
}