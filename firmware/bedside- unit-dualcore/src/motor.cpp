#include "motor.h"
#include "config.h"
#include "shared_data.h"

void initMotor() {
    pinMode(PIN_EN, OUTPUT);
    pinMode(PIN_STEP, OUTPUT);
    pinMode(PIN_DIR, OUTPUT);
    
    // TMC2208 Enable is active LOW. Setting it HIGH disables the driver
    // to save battery and keep the motor cool at startup.
    digitalWrite(PIN_EN, HIGH); 
}

// Low-level pulse generation
void moveStepper(bool closeDirection, int steps) {
    if (steps <= 0) return;
    
    digitalWrite(PIN_EN, LOW); // Enable motor driver
    digitalWrite(PIN_DIR, closeDirection ? DIR_CLOSE_LEVEL : DIR_OPEN_LEVEL);
    delayMicroseconds(20); // Pin setup delay
    
    for (int i = 0; i < steps; i++) {
        digitalWrite(PIN_STEP, HIGH);
        delayMicroseconds(STEP_DELAY_US);
        digitalWrite(PIN_STEP, LOW);
        delayMicroseconds(STEP_DELAY_US);
    }
}

void openClamp(int steps) {
    lockTelemetry();
    int currentPos = telemetry.clampPos;
    int allowed = min(steps, currentPos - CLAMP_OPEN_POS);
    unlockTelemetry();

    if (allowed > 0) {
        moveStepper(false, allowed);
        
        lockTelemetry();
        telemetry.clampPos -= allowed;
        unlockTelemetry();
    }
}

void closeClamp(int steps) {
    lockTelemetry();
    int currentPos = telemetry.clampPos;
    int allowed = min(steps, CLAMP_CLOSED_POS - currentPos);
    unlockTelemetry();

    if (allowed > 0) {
        moveStepper(true, allowed);
        
        lockTelemetry();
        telemetry.clampPos += allowed;
        unlockTelemetry();
    }
}

void disableMotor() {
    digitalWrite(PIN_EN, HIGH); // Disables motor windings to save power
}
