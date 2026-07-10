#include <Arduino.h>
#include "config.h"
#include "shared_data.h"
#include "ir_sensor.h"
#include "motor.h"
#include "espnow_comm.h"
#include "ui_control.h"
#include "pid_controller.h"

TaskHandle_t ControlTaskHandle = NULL;
TaskHandle_t CommUITaskHandle = NULL;

// -------------------- Core 1 Task (Sensing & Motor Control) --------------------
void vControlTask(void *pvParameters) {
    Serial.println("Control Task: Initialized on Core 1");

    for (;;) {
        // 1. Poll the IR sensor very fast to detect drops
        //pollIRSensor();

        // 2. Run the PID FSM flow rate clamp calculations
        runFlowControlLoop();

        // Delay 2ms to yield and prevent CPU locking on Core 1
        vTaskDelay(pdMS_TO_TICKS(2));
    }
}

// -------------------- Core 0 Task (UI & Telemetry Transmission) --------------------
void vCommUITask(void *pvParameters) {
    Serial.println("Comm/UI Task: Initialized on Core 0");

    unsigned long lastVolumeUpdateMs = millis();
    unsigned long lastTxMs = 0;

    for (;;) {
        // 1. Read keypad input matrix
        handleKeypadInput();

        // 2. Perform time-based volume remaining deduction
        unsigned long now = millis();
        unsigned long elapsedMs = now - lastVolumeUpdateMs;
        lastVolumeUpdateMs = now;
        updateVolumeTelemetry(elapsedMs);

        // 3. Refresh LCD drawing
        updateUI();

        // 4. Periodically transmit telemetry over ESP-NOW every 1000ms
        if (now - lastTxMs >= 1000) {
            lastTxMs = now;
            transmitTelemetry();
        }

        // Delay 15ms to yield and prevent CPU locking on Core 0
        vTaskDelay(pdMS_TO_TICKS(15));
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("--- Starting Smart IV Dual-Core System ---");

    // 1. Initialize safe thread communication
    initSharedTelemetry();

    // 2. Initialize Hardware Peripherals
    initIRSensor();
    initMotor();
    initUI();
    initEspNow();

    // 3. Spawn Core 1 Task (highest priority for physical safety & controls)
    xTaskCreatePinnedToCore(
        vControlTask,
        "ControlTask",
        4096,
        NULL,
        2, // Higher priority
        &ControlTaskHandle,
        1  // Pinned to Core 1
    );

    // 4. Spawn Core 0 Task (lower priority for user menus & networking)
    xTaskCreatePinnedToCore(
        vCommUITask,
        "CommUITask",
        4096,
        NULL,
        1, // Lower priority
        &CommUITaskHandle,
        0  // Pinned to Core 0
    );
}

void loop() {
    // Delete the loop task to free memory, as our work is handled by FreeRTOS tasks
    vTaskDelete(NULL);
}
