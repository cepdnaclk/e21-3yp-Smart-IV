#include "pid_controller.h"
#include "config.h"
#include "shared_data.h"
#include "ir_sensor.h"
#include "motor.h"

static unsigned long lastControlMs = 0;
static unsigned long lastNoiseCheckMs = 0;
static unsigned long lastRawEdgesSnapshot = 0;

void runFlowControlLoop() {
    unsigned long nowMs = millis();
    
    lockTelemetry();
    bool running = telemetry.running;
    FsmState currentState = telemetry.fsmState;
    float targetMlhr = telemetry.targetMlhr;
    int currentClampPos = telemetry.clampPos;
    unlockTelemetry();

    // If the FSM is in SETUP or WAITING, disable the motor coils to save power
    if (!running && currentState != STATE_CRITICAL) {
        disableMotor();
        return;
    }

    // ========================================================
    // 1. CRITICAL STATE BEHAVIOR: Pinch tube to 100%
    // ========================================================
    if (currentState == STATE_CRITICAL) {
        if (currentClampPos < CLAMP_CLOSED_POS) {
            closeClamp(CLAMP_CLOSED_POS - currentClampPos);
            Serial.printf("[FSM] Critical Clamping Active... Pos: %d/%d\n", currentClampPos, CLAMP_CLOSED_POS);
        } else {
            lockTelemetry();
            telemetry.fsmState = STATE_WAITING;
            strcpy(telemetry.statusText, "WAITING");
            telemetry.running = false; 
            unlockTelemetry();
            
            disableMotor(); 
            Serial.println("[FSM] Transition: CRITICAL -> WAITING (Safety Pinch Complete)");
        }
        return;
    }

    // ========================================================
    // 2. NORMAL RUNNING BEHAVIORS (STABLE or WARNING)
    // ========================================================
    
    // Noise/Chatter Detection
    if (nowMs - lastNoiseCheckMs >= 2000) {
        unsigned long deltaRaw = rawEdges - lastRawEdgesSnapshot;
        lastRawEdgesSnapshot = rawEdges;
        lastNoiseCheckMs = nowMs;
        if (deltaRaw > 25) {
            lockTelemetry();
            telemetry.sensorNoisy = true;
            unlockTelemetry();
            Serial.println("[WARNING] High electrical noise detected on sensor line!");
        }
    }

    // Convert raw sensor drop interval (EMA) to actual flow rate
    float realFlowMlhr = 0.0f;
    if (hasInterval && emaIntervalUs > 0) {
        unsigned long nowUs = micros();
        if (nowUs - (lastAcceptedDropMs * 1000UL) <= BLOCKAGE_TIMEOUT_MS * 1000UL) {
            realFlowMlhr = 3600000000.0f / ((float)emaIntervalUs * (float)DROP_FACTOR);
        }
    }

    // Write computed flow rate and flags to telemetry state
    lockTelemetry();
    if (realFlowMlhr > 350.0f) {
        telemetry.sensorNoisy = true;
        realFlowMlhr = 0.0f;
    }
    
    if (acceptedDrops >= 2) {
        telemetry.realDropsSeen = true;
    }

    if (telemetry.forcedBlockage) {
        telemetry.measuredFlowMlhr = 0.0f;
    } else if (!telemetry.sensorNoisy && telemetry.realDropsSeen) {
        telemetry.measuredFlowMlhr = realFlowMlhr;
    } else {
        telemetry.measuredFlowMlhr = 0.0f;
    }

    float currentFlow = telemetry.measuredFlowMlhr;
    bool realSeen = telemetry.realDropsSeen;
    bool forcedBlock = telemetry.forcedBlockage;
    float remainingVol = telemetry.volRemainingMl;
    int battery = telemetry.batteryPct;
    unlockTelemetry();

    // --- FSM ANOMALY CHECK: Blockage Timeout ---
    if (realSeen && !forcedBlock) {
        if (nowMs - lastAcceptedDropMs > BLOCKAGE_TIMEOUT_MS) {
            lockTelemetry();
            telemetry.fsmState = STATE_CRITICAL;
            strcpy(telemetry.statusText, "CRITICAL");
            unlockTelemetry();
            Serial.println("[FSM] Fluid Interruption Detected! Transition -> CRITICAL");
            return;
        }
    }

    // --- FSM WARNING/STABLE TRANSITIONS ---
    float error = targetMlhr - currentFlow;
    
    // Only flag flow deviation warnings if the system has actively started tracking real drops
    bool flowDeviation = realSeen ? (abs(error) > FLOW_TOLERANCE_MLHR) : false;
    bool hasWarningCondition = flowDeviation || (battery < 20) || (remainingVol < 50.0f);

    if (currentState == STATE_STABLE && hasWarningCondition) {
        lockTelemetry();
        telemetry.fsmState = STATE_WARNING;
        strcpy(telemetry.statusText, "WARNING");
        unlockTelemetry();
        Serial.println("[FSM] Transition: STABLE -> WARNING");
    } 
    else if (currentState == STATE_WARNING && !hasWarningCondition) {
        lockTelemetry();
        telemetry.fsmState = STATE_STABLE;
        strcpy(telemetry.statusText, "STABLE");
        unlockTelemetry();
        Serial.println("[FSM] Transition: WARNING -> STABLE");
    }

    // --- PID / BANG-BANG MOTOR CORRECTIONS ---
    if (nowMs - lastControlMs >= CONTROL_INTERVAL_MS) {
        lastControlMs = nowMs;

        // Skip motor movements if no drops have physically been registered yet or target is zero
        if (!realSeen || targetMlhr <= 0.0f || forcedBlock) return;

        if (error > FLOW_TOLERANCE_MLHR) {
            openClamp(CORRECTION_STEPS);
            Serial.printf("[CTRL] Flow Low (%.1f < %.1f) -> Opening Clamp\n", currentFlow, targetMlhr);
        } else if (error < -FLOW_TOLERANCE_MLHR) {
            closeClamp(CORRECTION_STEPS);
            Serial.printf("[CTRL] Flow High (%.1f > %.1f) -> Closing Clamp\n", currentFlow, targetMlhr);
        }
    }
}
