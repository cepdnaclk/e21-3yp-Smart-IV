#include "ui_control.h"
#include "config.h"
#include "shared_data.h"
#include "ir_sensor.h"
#include "motor.h"
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>

// --- PHYSICAL KEYPAD MATRIX DEFINITIONS ---
char keys[KEYPAD_ROWS][KEYPAD_COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[4] = {19, 18, 5, 4};
byte colPins[4] = {17, 16, 14, 13}; 

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, KEYPAD_ROWS, KEYPAD_COLS);

static String typedBuffer = "";
static unsigned long lastLcdUpdateMs = 0;

enum SetupStep {
    STEP_ENTER_BED,
    STEP_ENTER_FLOW,
    STEP_ENTER_VOL,
    STEP_REVIEW
};
static SetupStep currentSetupStep = STEP_ENTER_BED;

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
    telemetry.running = true;            // Keep running true so the safety clamping loop can execute
    telemetry.measuredFlowMlhr = 0.0f;
    telemetry.fsmState = STATE_CRITICAL; // Transition to CRITICAL to trigger clamping
    strcpy(telemetry.statusText, "CRITICAL");
    unlockTelemetry();
    
    Serial.println("[FSM] Infusion Paused -> Transitioning to CRITICAL for Safety Pinch");
}


void resumeInfusion() {
    lockTelemetry();
    telemetry.running = true;
    telemetry.fsmState = STATE_STABLE;
    strcpy(telemetry.statusText, "STABLE");
    unlockTelemetry();
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
    
    currentSetupStep = STEP_ENTER_BED;
    disableMotor();
    Serial.println("[FSM] Transition: WAITING -> SETUP (New Session)");
}

void handleKeypadInput() {
    char raw = keypad.getKey();
    if (!raw) return;

    char key = raw;
    Serial.printf("[KEY] Mapped: %c\n", key);

    lockTelemetry();
    FsmState currentState = telemetry.fsmState;
    unlockTelemetry();

    if (currentState == STATE_WAITING) {
        if (key == 'C') {
            resumeInfusion();
        } else if (key == '#') {
            resetToSetup();
        }
        return; 
    }

    if (currentState == STATE_SETUP) {
        if (key >= '0' && key <= '9') {
            if (typedBuffer.length() < 6) typedBuffer += key;
            return;
        } else if (key == 'B') {
            typedBuffer = "";
            return;
        }

        switch (currentSetupStep) {
            case STEP_ENTER_BED:
                if (key == 'A' && typedBuffer.length() > 0) {
                    lockTelemetry();
                    strncpy(telemetry.bedId, typedBuffer.c_str(), sizeof(telemetry.bedId) - 1);
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
                } else if (key == 'D') {
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
                } else if (key == 'D') {
                    lockTelemetry();
                    typedBuffer = String((int)telemetry.targetMlhr);
                    unlockTelemetry();
                    currentSetupStep = STEP_ENTER_FLOW;
                }
                break;

            case STEP_REVIEW:
                if (key == '*') {
                    startInfusion();
                } else if (key == 'D') {
                    lockTelemetry();
                    typedBuffer = String((int)telemetry.maxVolumeMl);
                    unlockTelemetry();
                    currentSetupStep = STEP_ENTER_VOL;
                }
                break;
        }
    } else {
        if (key == '#') {
            pauseInfusion();
        }
    }
}

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
            telemetry.fsmState = STATE_CRITICAL;
            strcpy(telemetry.statusText, "CRITICAL");
        }
    }
    unlockTelemetry();
}

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
        switch (currentSetupStep) {
            case STEP_ENTER_BED:
                printLcdLine(0, "--- SETUP MENU ---");
                printLcdLine(1, "Enter Bed ID:");
                printLcdLine(2, "[" + typedBuffer + "]");
                printLcdLine(3, "F1=Next  F2=Clear");
                break;

            case STEP_ENTER_FLOW:
                printLcdLine(0, "--- SETUP MENU ---");
                printLcdLine(1, "Enter Flow Rate:");
                printLcdLine(2, "[" + typedBuffer + "] ml/hr");
                printLcdLine(3, "F1=Next F4=Back");
                break;

            case STEP_ENTER_VOL:
                printLcdLine(0, "--- SETUP MENU ---");
                printLcdLine(1, "Enter Bag Volume:");
                printLcdLine(2, "[" + typedBuffer + "] ml");
                printLcdLine(3, "F1=Next F4=Back");
                break;

            case STEP_REVIEW:
                printLcdLine(0, "Review Setup:");
                printLcdLine(1, "Bed:" + bed + " Rate:" + String(target, 0) + "ml/h");
                printLcdLine(2, "Bag Vol: " + String(maxVol, 0) + " ml");
                printLcdLine(3, "*=Start F4=Edit");
                break;
        }
    } else {
        String line0 = "Bed " + bed + " " + status;
        String line1 = "T:" + String(target, 0) + " F:" + String(flow, 1);
        String line2 = "Vol:" + String(volRem, 1) + "ml";
        String line3;
        if (currentState == STATE_WAITING) {
            line3 = "F3=Res STOP=New";
        } else {
            line3 = "STOP=Pause";
        }
        
        printLcdLine(0, line0);
        printLcdLine(1, line1);
        printLcdLine(2, line2);
        printLcdLine(3, line3);
    }
}
