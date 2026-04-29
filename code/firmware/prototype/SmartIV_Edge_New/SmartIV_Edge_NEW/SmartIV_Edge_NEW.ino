// ============================================================
//  SMART IV — Edge Device Firmware (DEMO POC VERSION)
//  Team Zephyrus
// ============================================================

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Keypad.h>
#include <WiFi.h>
#include <esp_now.h>
#include <ArduinoJson.h>

// ─────────────────────────────────────────────
//  ESP-NOW CONFIG
// ─────────────────────────────────────────────
uint8_t RECEIVER_MAC[] = {0xAC, 0xA7, 0x04, 0x27, 0xB8, 0x38}; 

#define ESPNOW_SEND_INTERVAL_MS  2000
#define MAX_PACKET_SIZE          256

typedef struct {
  char payload[MAX_PACKET_SIZE];
} ESPNowPacket;

ESPNowPacket outgoingPacket;
unsigned long lastEspNowSendTime = 0;
bool espNowReady = false;

// ESP-NOW send callback (Updated for ESP32 Core 3.x)
void onDataSent(const esp_now_send_info_t *info, esp_now_send_status_t status) {
  // Silent to avoid serial clutter during demo
}

// ─────────────────────────────────────────────
//  OLED & HARDWARE CONFIG
// ─────────────────────────────────────────────
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64
#define OLED_RESET     -1
#define OLED_ADDR    0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define PIN_EN    27
#define PIN_STEP  25
#define PIN_DIR   26

#define STEPS_PER_REV         200
#define STEP_DELAY_US         800
#define MAX_CLAMP_STEPS       400
#define MOTOR_STEP_ADJUST      2

#define PIN_IR_RX        34
#define IR_RECEIVER_PIN  PIN_IR_RX

// ─────────────────────────────────────────────
//  KEYPAD (C is F3 during blockage, otherwise Stop)
// ─────────────────────────────────────────────
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},   // A = F1 (Confirm)
  {'4','5','6','B'},   // B = F2 (Start)
  {'7','8','9','C'},   // C = F3 (Resume from Blockage) / Stop
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {13, 14, 16, 17};
byte colPins[COLS] = { 4,  5, 18, 19};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ─────────────────────────────────────────────
//  DROP / FLOW CONSTANTS
// ─────────────────────────────────────────────
#define DROP_FACTOR      20
#define ML_PER_DROP      (1.0f / DROP_FACTOR)
#define FLOW_CONTROL_INTERVAL_MS   3000

#define MIN_BLOCK_MS          1    // Fast drop sensitivity
#define POST_DROP_LOCKOUT_MS  80

#define IR_STATE_IDLE     0
#define IR_STATE_WAITING  1

// ── DEMO TIMING CONSTANTS ──
#define GRACE_PERIOD_MS       40000   // 40s before strict 5s rule applies
#define DEMO_BLOCKAGE_MS      5000    // 5s trigger for POC demo
#define STARTUP_BLOCKAGE_MS   15000   // 15s trigger during initial grace period
#define NO_DROP_EMPTY_MS      30000
#define NEARLY_EMPTY_ML       30.0f
#define SERIAL_REPORT_MS      2000

// ─────────────────────────────────────────────
//  STATE & SESSION VARIABLES
// ─────────────────────────────────────────────
enum AppState { STATE_ENTER_BEDID, STATE_ENTER_VOLUME, STATE_ENTER_FLOWRATE, STATE_CONFIRM, STATE_RUNNING };
AppState appState = STATE_ENTER_BEDID;

int sessionId = 0;
String inputBuffer = "";
String bedId = "";
float maxVolume = 0;
float targetMlhr = 0;
float volRemaining = 0;
long totalDrops = 0;
float currentFlowRate = 0;

volatile uint8_t irDropState = IR_STATE_IDLE;
volatile unsigned long lastEdgeTime = 0;
volatile unsigned long fallingEdgeTime = 0;
volatile long dropCountISR = 0;
volatile unsigned long lastDropTime = 0;

long dropCountSnapshot = 0;
unsigned long lastFlowCalcTime = 0;
unsigned long lastSerialTime = 0;
unsigned long sessionStartTime = 0;
unsigned long lastDropMillis = 0;

int currentClampSteps = 0;
int activeStartPos = 0;  // Saved open position to return to after pause
String statusStr = "STABLE";

// ── DEMO PAUSE FLAGS ──
bool isPausedForBlockage = false;
bool awaitingResumeDrop = false;
unsigned long resumeTime = 0;


// ─────────────────────────────────────────────
//  ISR — drop detection
// ─────────────────────────────────────────────
void IRAM_ATTR onIRChange() {
  unsigned long now = millis();
  if (lastDropTime > 0 && (now - lastDropTime) < POST_DROP_LOCKOUT_MS) return;

  int pinLevel = digitalRead(IR_RECEIVER_PIN);
  if (irDropState == IR_STATE_IDLE && pinLevel == LOW) {
    fallingEdgeTime = now;
    irDropState = IR_STATE_WAITING;
  } else if (irDropState == IR_STATE_WAITING && pinLevel == HIGH) {
    unsigned long blockDuration = now - fallingEdgeTime;
    if (blockDuration >= MIN_BLOCK_MS) {
      dropCountISR++;
      lastDropTime = now;
    }
    irDropState = IR_STATE_IDLE;
  }
}

// ─────────────────────────────────────────────
//  STEPPER HELPERS
// ─────────────────────────────────────────────
void stepperEnable()  { digitalWrite(PIN_EN, LOW); }
void stepperDisable() { digitalWrite(PIN_EN, HIGH); }

void moveMotor(int steps, bool clampMore) {
  digitalWrite(PIN_DIR, clampMore ? HIGH : LOW);
  delayMicroseconds(5);
  for (int i = 0; i < steps; i++) {
    digitalWrite(PIN_STEP, HIGH);
    delayMicroseconds(STEP_DELAY_US / 2);
    digitalWrite(PIN_STEP, LOW);
    delayMicroseconds(STEP_DELAY_US / 2);
  }
}

void moveToClampPosition(int targetSteps) {
  targetSteps = constrain(targetSteps, 0, MAX_CLAMP_STEPS);
  int delta = targetSteps - currentClampSteps;
  if (delta == 0) return;
  moveMotor(abs(delta), delta > 0);
  currentClampSteps = targetSteps;
}

// ─────────────────────────────────────────────
//  OLED HELPERS
// ─────────────────────────────────────────────
void oledClear() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
}

void oledPrint(const String &line1, const String &line2 = "", const String &line3 = "", const String &line4 = "", const String &line5 = "") {
  oledClear();
  display.println(line1);
  if (line2.length()) display.println(line2);
  if (line3.length()) display.println(line3);
  if (line4.length()) display.println(line4);
  if (line5.length()) display.println(line5);
  display.display();
}

void promptBedId() { oledPrint("=== Smart IV ===", "Enter Bed ID", "(1-16), press A", "> " + inputBuffer); }
void promptVolume() { oledPrint("Bed: " + bedId, "IV Bag Volume?", "(e.g. 500,1000)", "Press A to OK", "> " + inputBuffer); }
void promptFlowRate() { oledPrint("Bed: " + bedId, "Vol: " + String((int)maxVolume) + " mL", "Flow rate mL/hr?", "Press A to OK", "> " + inputBuffer); }
void promptConfirm() {
  int targetDpm = (int)((targetMlhr * DROP_FACTOR) / 60.0f);
  oledPrint("=== CONFIRM ===", "Bed:" + bedId + " Vol:" + String((int)maxVolume), "Flow:" + String(targetMlhr, 0) + "mL/h ~" + String(targetDpm) + "dpm", "B=START  C=BACK");
}

// ─────────────────────────────────────────────
//  RESET TO START
// ─────────────────────────────────────────────
void resetToStart() {
  inputBuffer = ""; bedId = ""; maxVolume = 0; targetMlhr = 0; volRemaining = 0;
  totalDrops = 0; currentFlowRate = 0; dropCountISR = 0; dropCountSnapshot = 0;
  irDropState = IR_STATE_IDLE; lastEdgeTime = 0; lastDropTime = 0;
  statusStr = "STABLE"; isPausedForBlockage = false; awaitingResumeDrop = false;

  stepperEnable();
  moveToClampPosition(MAX_CLAMP_STEPS);
  delay(300);
  moveToClampPosition(0);
  stepperDisable();

  appState = STATE_ENTER_BEDID;
  promptBedId();
}

// ─────────────────────────────────────────────
//  START INFUSION
// ─────────────────────────────────────────────
void startInfusion() {
  sessionId = random(200, 301);
  volRemaining = maxVolume;
  totalDrops = 0; dropCountISR = 0; dropCountSnapshot = 0;
  lastFlowCalcTime = millis(); lastSerialTime = millis(); sessionStartTime = millis(); lastDropMillis = millis();
  statusStr = "STABLE"; currentFlowRate = 0;
  isPausedForBlockage = false; awaitingResumeDrop = false;

  stepperEnable();
  moveToClampPosition(MAX_CLAMP_STEPS);
  delay(500);

  const float MAX_FLOW_MLHR = 200.0f;
  float ratio = constrain(targetMlhr / MAX_FLOW_MLHR, 0.0f, 1.0f);
  activeStartPos = (int)(MAX_CLAMP_STEPS * (1.0f - ratio * 0.7f)); // SAVE OPEN POSITION
  moveToClampPosition(activeStartPos);

  appState = STATE_RUNNING;
  irDropState = IR_STATE_IDLE;
  lastEdgeTime = 0;
  lastDropTime = millis();

  delay(300);
  attachInterrupt(digitalPinToInterrupt(PIN_IR_RX), onIRChange, CHANGE);
}

// ─────────────────────────────────────────────
//  OLED RUNNING DISPLAY
// ─────────────────────────────────────────────
void updateOledRunning() {
  oledClear();
  display.setTextSize(1);
  if (statusStr == "STABLE") {
    display.println("STATUS: STABLE");
  } else {
    display.println(statusStr.substring(0, 20));
  }
  display.printf("Bed:%s  %.0fmL/h\n", bedId.c_str(), currentFlowRate);
  display.printf("Vol: %.1f / %.0f mL\n", volRemaining, maxVolume);
  float targetDpm = (targetMlhr * DROP_FACTOR) / 60.0f;
  float measuredDpm = (currentFlowRate * DROP_FACTOR) / 60.0f;
  display.printf("DPM T:%.1f M:%.1f\n", targetDpm, measuredDpm);
  display.printf("Drops: %ld\n", totalDrops);
  display.display();
}

// ─────────────────────────────────────────────
//  JSON PACKET
// ─────────────────────────────────────────────
String buildJsonPacket() {
  StaticJsonDocument<256> doc;
  doc["bedId"] = bedId;
  doc["status"] = statusStr;
  doc["flowRate"] = serialized(String(currentFlowRate, 2));
  doc["volRemaining"] = serialized(String(volRemaining, 2));
  doc["maxVolume"] = (int)maxVolume;
  doc["battery"] = 87;
  doc["dropFactor"] = DROP_FACTOR;
  doc["targetMlhr"] = serialized(String(targetMlhr, 1));
  doc["sessionId"] = sessionId;
  String out; serializeJson(doc, out); return out;
}

void sendEspNowPacket() {
  if (!espNowReady) return;
  String json = buildJsonPacket();
  memset(outgoingPacket.payload, 0, MAX_PACKET_SIZE);
  json.toCharArray(outgoingPacket.payload, MAX_PACKET_SIZE);
  esp_now_send(RECEIVER_MAC, (uint8_t *)&outgoingPacket, sizeof(outgoingPacket));
}

// ─────────────────────────────────────────────
//  FLOW CONTROL LOOP (Calculations Only)
// ─────────────────────────────────────────────
void runFlowControlLoop() {
  unsigned long now = millis();
  float elapsedMin = (float)(now - lastFlowCalcTime) / 60000.0f;
  lastFlowCalcTime = now;

  long dropsThisCycle = dropCountISR - dropCountSnapshot;
  dropCountSnapshot = dropCountISR;
  totalDrops = dropCountISR;

  noInterrupts();
  lastDropMillis = lastDropTime;
  interrupts();

  float volConsumed = dropsThisCycle * ML_PER_DROP;
  volRemaining -= volConsumed;
  if (volRemaining < 0) volRemaining = 0;

  if (elapsedMin > 0) {
    currentFlowRate = (dropsThisCycle * ML_PER_DROP) / elapsedMin;
  }

  // PID Motor Adjustment
  if (statusStr == "STABLE") {
    float targetDpm = (targetMlhr * DROP_FACTOR) / 60.0f;
    float measuredDpm = (currentFlowRate * DROP_FACTOR) / 60.0f;
    float dpmError = targetDpm - measuredDpm;

    int adjustSteps = constrain((int)(abs(dpmError) * 1.5f), 0, 10);
    if (dpmError > 0.5f) {
      moveToClampPosition(max(0, currentClampSteps - adjustSteps));
    } else if (dpmError < -0.5f) {
      moveToClampPosition(min(MAX_CLAMP_STEPS, currentClampSteps + adjustSteps));
    }
  }
}

// ─────────────────────────────────────────────
//  KEYPAD HANDLER
// ─────────────────────────────────────────────
void handleKey(char key) {
  // DEMO LOGIC: 'C' becomes F3 (Resume) if Blocked
  if (key == 'C') {
    if (appState == STATE_RUNNING && statusStr == "CRITICAL") {
      isPausedForBlockage = false;
      awaitingResumeDrop = true;
      resumeTime = millis();
      stepperEnable();
      moveToClampPosition(activeStartPos); // Return to standard open pos
      // Status deliberately left as CRITICAL until drop falls
      return; 
    } else {
      // Normal Stop/Back
      detachInterrupt(digitalPinToInterrupt(PIN_IR_RX));
      stepperEnable();
      moveToClampPosition(MAX_CLAMP_STEPS);
      delay(200);
      stepperDisable();
      resetToStart();
      return;
    }
  }

  switch (appState) {
    case STATE_ENTER_BEDID:
      if (key >= '0' && key <= '9' && inputBuffer.length() < 2) inputBuffer += key;
      else if (key == 'A') {
        int id = inputBuffer.toInt();
        if (id >= 1 && id <= 16) { bedId = (id < 10 ? "0" : "") + String(id); inputBuffer = ""; appState = STATE_ENTER_VOLUME; promptVolume(); }
        else { inputBuffer = ""; promptBedId(); }
      }
      if (appState == STATE_ENTER_BEDID) promptBedId();
      break;
    case STATE_ENTER_VOLUME:
      if (key >= '0' && key <= '9' && inputBuffer.length() < 5) inputBuffer += key;
      else if (key == 'A') {
        float vol = inputBuffer.toFloat();
        if (vol >= 50 && vol <= 2000) { maxVolume = vol; inputBuffer = ""; appState = STATE_ENTER_FLOWRATE; promptFlowRate(); }
        else { inputBuffer = ""; promptVolume(); }
      }
      if (appState == STATE_ENTER_VOLUME) promptVolume();
      break;
    case STATE_ENTER_FLOWRATE:
      if (key >= '0' && key <= '9' && inputBuffer.length() < 4) inputBuffer += key;
      else if (key == 'A') {
        float fr = inputBuffer.toFloat();
        if (fr >= 1 && fr <= 500) { targetMlhr = fr; inputBuffer = ""; appState = STATE_CONFIRM; promptConfirm(); }
        else { inputBuffer = ""; promptFlowRate(); }
      }
      if (appState == STATE_ENTER_FLOWRATE) promptFlowRate();
      break;
    case STATE_CONFIRM:
      if (key == 'B') startInfusion();
      break;
    case STATE_RUNNING:
      break;
  }
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(35));
  pinMode(PIN_EN, OUTPUT); pinMode(PIN_STEP, OUTPUT); pinMode(PIN_DIR, OUTPUT);
  stepperDisable();
  pinMode(PIN_IR_RX, INPUT);

  Wire.begin(21, 22);
  display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  oledClear();
  oledPrint("  Smart IV", "  Team Zephyrus", "", "  Booting...");
  
  stepperEnable();
  moveToClampPosition(MAX_CLAMP_STEPS);
  delay(300);
  moveToClampPosition(0);
  stepperDisable();

  appState = STATE_ENTER_BEDID;
  promptBedId();

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  if (esp_now_init() == ESP_OK) {
    esp_now_register_send_cb(onDataSent);
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, RECEIVER_MAC, 6);
    peerInfo.channel = 0; peerInfo.encrypt = false;
    espNowReady = (esp_now_add_peer(&peerInfo) == ESP_OK);
  }
}

// ─────────────────────────────────────────────
//  LOOP
// ─────────────────────────────────────────────
void loop() {
  char key = keypad.getKey();
  if (key) handleKey(key);

  if (appState == STATE_RUNNING) {
    unsigned long now = millis();
    unsigned long timeSinceStart = now - sessionStartTime;
    
    // Safely get last drop time from ISR
    noInterrupts();
    unsigned long safeLastDrop = lastDropTime;
    interrupts();
    // Prevent unsigned underflow race condition if an ISR droplet fires after 'now' was captured
    unsigned long timeSinceLastDrop = (now >= safeLastDrop) ? (now - safeLastDrop) : 0;

    // 1. DEMO INSTANT BLOCKAGE CHECK (Continuous)
    if (!isPausedForBlockage && !awaitingResumeDrop && volRemaining > 0) {
      unsigned long blockThreshold = (timeSinceStart < GRACE_PERIOD_MS) ? STARTUP_BLOCKAGE_MS : DEMO_BLOCKAGE_MS;
      
      if (timeSinceLastDrop > blockThreshold) {
        statusStr = "CRITICAL";       // 1. Exact string match for React
        currentFlowRate = 0;          // 2. Force flow to 0 so the desktop alert triggers
        isPausedForBlockage = true;
        stepperEnable();
        moveToClampPosition(MAX_CLAMP_STEPS); // Fake Full Pinch
        updateOledRunning(); 
        sendEspNowPacket();
      }
    }

    // 2. AWAITING RESUME DROP CHECK (Continuous)
    if (awaitingResumeDrop) {
      if (safeLastDrop > resumeTime) { // Drop detected after pressing F3!
        awaitingResumeDrop = false;
        statusStr = "STABLE";
        
        // Reset calculation baselines so flow/volume doesn't spike
        lastFlowCalcTime = now;
        dropCountSnapshot = dropCountISR;
        lastDropMillis = safeLastDrop;
        
        updateOledRunning();
        sendEspNowPacket();
      }
    }

    // 3. REGULAR FLOW CALCULATION (Every 3s)
    if (now - lastFlowCalcTime >= FLOW_CONTROL_INTERVAL_MS) {
      if (!isPausedForBlockage && !awaitingResumeDrop) {
        runFlowControlLoop();
      } else {
        // Paused: Just keep baseline moving so math stays stable
        lastFlowCalcTime = now;
        dropCountSnapshot = dropCountISR; 
      }
    }

    // 4. UI & ESP-NOW UPDATES (Every 2s)
    if (now - lastSerialTime >= SERIAL_REPORT_MS) {
      lastSerialTime = now;
      updateOledRunning();
      
      // Print Serial JSON
      String json = buildJsonPacket();
      Serial.println("\n--- PACKET ---");
      Serial.println(json);
      Serial.println("--- END ---\n");
      
      sendEspNowPacket();
    }
  }
}