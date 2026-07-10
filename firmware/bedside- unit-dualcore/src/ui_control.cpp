#include "ui_control.h"
#include "config.h"
#include "shared_data.h"
#include "ir_sensor.h"
#include "motor.h" // Needed to disable/freeze the motor on pause
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>

// --- PHYSICAL KEYPAD MATRIX DEFINITIONS (From working demo) ---
char keys[KEYPAD_ROWS][KEYPAD_COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[4] = {19, 18, 5, 4};
byte colPins[4] = {17, 16, 14, 13};  // Actually the column wires

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, KEYPAD_ROWS, KEYPAD_COLS);

static String typedBuffer = "";
static unsigned long lastLcdUpdateMs = 0;

// --- SETUP STEP ENUM ---
enum SetupStep {
    STEP_ENTER_BED,
    STEP_ENTER_FLOW,
    STEP_ENTER_VOL,
    STEP_REVIEW
};
static SetupStep currentSetupStep = STEP_ENTER_BED;

// Since your wiring is standard 1-to-1 now, no translation is needed
char translateKey(char raw) {
    return raw;
}

void initUI() {
    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Smart IV Init...");
}

void startInfusion() {
    lockTelemetry();
    if (telemetry.targetMlhr <= 0.0f || telemetry.maxVolumeMl <= 0.0f) {
        Serial.println("[START] Error: Missing parameters!");
        unlockTelemetry();
        return;
    }
    telemetry.running = true;
    telemetry.volRemainingMl = telemetry.maxVolumeMl;
    telemetry.realDropsSeen = false;
    telemetry.forcedBlockage = false;
    telemetry.fsmState = STATE_STABLE;
    strcpy(telemetry.statusText, "STABLE");
    snprintf(telemetry.sessionId, sizeof(telemetry.sessionId), "sess-%s-%lu", telemetry.bedId, millis() % 100000UL);
    unlockTelemetry();
    
    resetIRStats();
    Serial.println("[FSM] Transition: SETUP -> STABLE");
}

void pauseInfusion() {
    lockTelemetry();
    telemetry.running = false;
    telemetry.measuredFlowMlhr = 0.0f;
    telemetry.fsmState = STATE_WAITING;
    strcpy(telemetry.statusText, "WAITING");
    unlockTelemetry();
    
    disableMotor(); // Freezes motor immediately
    Serial.println("[FSM] Transition: RUNNING -> WAITING (Paused)");
}

void resumeInfusion() {
    lockTelemetry();
    telemetry.running = true;
    telemetry.fsmState = STATE_STABLE;
    strcpy(telemetry.statusText, "STABLE");
    unlockTelemetry();
    
    // Do NOT clear session volume parameters, just resume counting drops
    Serial.println("[FSM] Transition: WAITING -> STABLE (Resumed)");
}

void resetToSetup() {
    lockTelemetry();
    telemetry.running = false;
    telemetry.measuredFlowMlhr = 0.0f;
    telemetry.targetMlhr = 0.0f;
    telemetry.maxVolumeMl = 0.0f;
    telemetry.volRemainingMl = 0.0f;
    telemetry.fsmState = STATE_SETUP;
    strcpy(telemetry.statusText, "SETUP");
    unlockTelemetry();
    
    currentSetupStep = STEP_ENTER_BED; // Reset menu back to Bed ID entry
    disableMotor();
    Serial.println("[FSM] Transition: WAITING -> SETUP (New Session)");
}

void handleKeypadInput() {
    char raw = keypad.getKey();
    if (!raw) return;

    char key = translateKey(raw);
    Serial.printf("[KEY] Mapped: %c\n", key);

    lockTelemetry();
    FsmState currentState = telemetry.fsmState;
    unlockTelemetry();

    // --- STATE MACHINE ROUTING FOR KEYS ---
    if (currentState == STATE_WAITING) {
        // In WAITING, only accept Resume (C) or New Session / Reset (#)
        if (key == 'C') {
            resumeInfusion();
        } else if (key == '#') {
            resetToSetup();
        }
        return; 
    }

    if (currentState == STATE_SETUP) {
        // 1. Handle number inputs
        if (key >= '0' && key <= '9') {
            if (typedBuffer.length() < 6) typedBuffer += key;
            return;
        } 
        // 2. Handle All Clear (B)
        else if (key == 'B') {
            typedBuffer = "";
            return;
        } 
        // 3. Handle Backspace (*), but only on entry screens
        else if (key == '*' && currentSetupStep != STEP_REVIEW) {
            if (typedBuffer.length() > 0) {
                typedBuffer.remove(typedBuffer.length() - 1);
            }
            return;
        }

        // Handle navigation based on the current setup step
        switch (currentSetupStep) {
            case STEP_ENTER_BED:
                if (key == 'A' && typedBuffer.length() > 0) { // 'A' acts as Next / Enter
                    lockTelemetry();
                    strncpy(telemetry.bedId,typedBuffer.c_str(), sizeof(telemetry.bedId)-1);
                        telemetry.bedId[sizeof(telemetry.bedId)-1] = '\0';
                    unlockTelemetry();
                    typedBuffer = "";
                    currentSetupStep = STEP_ENTER_FLOW;
                }
                break;

            case STEP_ENTER_FLOW:
                if (key == 'A' && typedBuffer.length() > 0) {
                    lockTelemetry();
                    telemetry.targetMlhr = typedBuffer.toFloat();
                    unlockTelemetry();
                    typedBuffer = "";
                    currentSetupStep = STEP_ENTER_VOL;
                } else if (key == 'D') { // Go back (Preload Bed ID)
                    lockTelemetry();
                    typedBuffer = String(telemetry.bedId);
                    unlockTelemetry();
                    currentSetupStep = STEP_ENTER_BED;
                }
                break;

            case STEP_ENTER_VOL:
                if (key == 'A' && typedBuffer.length() > 0) {
                    lockTelemetry();
                    telemetry.maxVolumeMl = typedBuffer.toFloat();
                    telemetry.volRemainingMl = telemetry.maxVolumeMl;
                    unlockTelemetry();
                    typedBuffer = "";
                    currentSetupStep = STEP_REVIEW;
                } else if (key == 'D') { // Go back (Preload Flow Target)
                    lockTelemetry();
                    typedBuffer = String((int)telemetry.targetMlhr);
                    unlockTelemetry();
                    currentSetupStep = STEP_ENTER_FLOW;
                }
                break;

            case STEP_REVIEW:
                if (key == '*') { // '*' starts the infusion from review screen
                    startInfusion();
                } else if (key == 'D') { // Go back (Preload Bag Volume)
                    lockTelemetry();
                    typedBuffer = String((int)telemetry.maxVolumeMl);
                    unlockTelemetry();
                    currentSetupStep = STEP_ENTER_VOL;
                }
                break;
        }
    } else {
        // While Running (STABLE or WARNING):
        // Pressing STOP (#) pauses it.
        if (key == '#') {
            pauseInfusion();
        }
    }
}

// Time-based deduction of bag volume
void updateVolumeTelemetry(unsigned long deltaMs) {
    lockTelemetry();
    bool running = telemetry.running;
    FsmState currentState = telemetry.fsmState;
    
    if (running && (currentState == STATE_STABLE || currentState == STATE_WARNING)) {
        float dtHr = (float)deltaMs / 3600000.0f;
        telemetry.volRemainingMl -= telemetry.measuredFlowMlhr * dtHr;
        
        if (telemetry.volRemainingMl <= 0.0f) {
            telemetry.volRemainingMl = 0.0f;
            telemetry.running = false;
            telemetry.fsmState = STATE_CRITICAL; // Triggers automatic clamping
            strcpy(telemetry.statusText, "CRITICAL");
        }
    }
    unlockTelemetry();
}

// Helper to write lines to LiquidCrystal screen
void printLcdLine(uint8_t row, String text) {
    lcd.setCursor(0, row);
    while (text.length() < LCD_COLS) text += " ";
    lcd.print(text.substring(0, LCD_COLS));
}

void updateUI() {
    unsigned long now = millis();
    if (now - lastLcdUpdateMs < 300) return;
    lastLcdUpdateMs = now;
    
    lockTelemetry();
    FsmState currentState = telemetry.fsmState;
    String bed = String(telemetry.bedId);
    float target = telemetry.targetMlhr;
    float maxVol = telemetry.maxVolumeMl;
    float volRem = telemetry.volRemainingMl;
    float flow = telemetry.measuredFlowMlhr;
    String status = String(telemetry.statusText);
    unlockTelemetry();

    if (currentState == STATE_SETUP) {
        // Step-by-Step Setup layout
        switch (currentSetupStep) {
            case STEP_ENTER_BED:
                printLcdLine(0, "--- SETUP MENU ---");
                printLcdLine(1, "Enter Bed ID:");
                printLcdLine(2, "[" + typedBuffer + "]");
                printLcdLine(3, "A:Next *:Del B:Clr");
                break;

            case STEP_ENTER_FLOW:
                printLcdLine(0, "--- SETUP MENU ---");
                printLcdLine(1, "Enter Flow Rate:");
                printLcdLine(2, "[" + typedBuffer + "] ml/hr");
                printLcdLine(3, "A:Next *:Del D:Bck");
                break;

            case STEP_ENTER_VOL:
                printLcdLine(0, "--- SETUP MENU ---");
                printLcdLine(1, "Enter Bag Volume:");
                printLcdLine(2, "[" + typedBuffer + "] ml");
                printLcdLine(3, "A:Next *:Del D:Bck");
                break;

            case STEP_REVIEW:
                printLcdLine(0, "Review Setup:");
                printLcdLine(1, "Bed:" + bed + " Rate:" + String(target, 0) + "ml/h");
                printLcdLine(2, "Bag Vol: " + String(maxVol, 0) + " ml");
                printLcdLine(3, "*:Start D:Edit");
                break;
        }
    } else {
        // Normal Running / Anomaly screen layout
        String line0 = "Bed " + bed + " " + status;
        String line1 = "T:" + String(target, 0) + " F:" + String(flow, 1);
        String line2 = "Vol:" + String(volRem, 1) + "ml";
        
        String line3;
        if (currentState == STATE_WAITING) {
            line3 = "C:Res  #:NewInf";
        } else {
            line3 = "#:Pause";
        }
        
        printLcdLine(0, line0);
        printLcdLine(1, line1);
        printLcdLine(2, line2);
        printLcdLine(3, line3);
    }
}
