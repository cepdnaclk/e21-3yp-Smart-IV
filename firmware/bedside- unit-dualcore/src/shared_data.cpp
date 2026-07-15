#include "shared_data.h"
#include "config.h"

TelemetryState telemetry;
SemaphoreHandle_t telemetryMutex = NULL;

void initSharedTelemetry() {
    telemetryMutex = xSemaphoreCreateMutex();
    
    strcpy(telemetry.bedId, BED_ID);
    telemetry.fsmState = STATE_SETUP;  // <--- ADDED THIS (Starts in SETUP)
    telemetry.targetMlhr = 0.0f;
    telemetry.maxVolumeMl = 0.0f;
    telemetry.volRemainingMl = 0.0f;
    telemetry.measuredFlowMlhr = 0.0f;
    telemetry.clampPos = CLAMP_CLOSED_POS;
    telemetry.batteryPct = 92; // Mock battery starting at 92%
    telemetry.running = false;
    telemetry.forcedBlockage = false;
    telemetry.sensorNoisy = false;
    telemetry.realDropsSeen = false;
    strcpy(telemetry.statusText, "SETUP");
    strcpy(telemetry.sessionId, "sess-none");
    strcpy(telemetry.lastTxResult, "WAIT");
}

void lockTelemetry() {
    if (telemetryMutex != NULL) {
        xSemaphoreTake(telemetryMutex, portMAX_DELAY);
    }
}

void unlockTelemetry() {
    if (telemetryMutex != NULL) {
        xSemaphoreGive(telemetryMutex);
    }
}
