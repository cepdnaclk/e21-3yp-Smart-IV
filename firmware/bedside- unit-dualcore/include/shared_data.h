#ifndef SHARED_DATA_H
#define SHARED_DATA_H

#include <Arduino.h>

// Define the Finite State Machine States
enum FsmState {
    STATE_SETUP,
    STATE_STABLE,
    STATE_WARNING,
    STATE_CRITICAL,
    STATE_WAITING
};

struct TelemetryState {
    char bedId[8];
    FsmState fsmState;        // <--- ADDED THIS (FSM state)
    float targetMlhr;
    float maxVolumeMl;
    float volRemainingMl;
    float measuredFlowMlhr;
    int clampPos;
    int batteryPct;
    bool running;
    bool forcedBlockage;
    bool sensorNoisy;
    bool realDropsSeen;
    char statusText[16];     // "SETUP", "STABLE", "WARNING", "CRITICAL", "WAITING"
    char sessionId[32];
    char lastTxResult[8];
};

extern TelemetryState telemetry;
extern SemaphoreHandle_t telemetryMutex;

// Safe Access APIs
void initSharedTelemetry();
void lockTelemetry();
void unlockTelemetry();

#endif
