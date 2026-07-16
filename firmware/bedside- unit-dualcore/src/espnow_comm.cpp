#include "espnow_comm.h"
#include "config.h"
#include "shared_data.h"
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

void initEspNow() {
    // 1. Force the Wi-Fi stack into Station Mode
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false); // Keeps radio active for low latency
    
    // 2. Set the physical radio channel to channel 1 (critical for ESP-NOW pairing)
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    // 3. Initialize ESP-NOW protocol
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] Init failed! Rebooting...");
        delay(1000);
        ESP.restart();
    }

    // 4. Add the Receiver Dongle as a paired peer
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, RECEIVER_MAC, 6);
    peerInfo.channel = ESPNOW_CHANNEL;
    peerInfo.encrypt = false; // Set to true if you decide to add CCMP encryption later

    esp_err_t result = esp_now_add_peer(&peerInfo);
    if (result == ESP_OK) {
        Serial.println("[ESPNOW] Receiver dongle peer added successfully");
    } else {
        Serial.printf("[ESPNOW] Failed to add peer. Error code: %d\n", result);
    }
}

void transmitTelemetry() {
    lockTelemetry();
    bool running = telemetry.running;
    FsmState state = telemetry.fsmState;
    float volRemaining = telemetry.volRemainingMl;
    
    // Safety check: don't broadcast if the unit is in raw SETUP mode
    if (!running && strcmp(telemetry.statusText, "SETUP") == 0) {
        unlockTelemetry();
        return;
    }

    // Map internal FSM state to Tauri expected status string
    const char *tauriStatus = "STABLE";
    if (volRemaining <= 1.0f) {
        tauriStatus = "EMPTY_BAG";
    } else if (telemetry.forcedBlockage) {
        tauriStatus = "BLOCKAGE";
    } else {
        tauriStatus = "STABLE";
    }

    // Build the JSON payload matching the Tauri app schema.
    // 1. We send "sessionId":null to satisfy SQLite foreign key constraints.
    // 2. We send telemetry.bedId dynamically instead of the hardcoded BED_ID.
    char json[240];
    int n = snprintf(json, sizeof(json),
        "{\"bedId\":\"%s\",\"status\":\"%s\",\"flowRate\":%.1f,\"volRemaining\":%.1f,\"maxVolume\":%.0f,\"battery\":%d,\"dropFactor\":%d,\"targetMlhr\":%.1f,\"sessionId\":null}",
        telemetry.bedId, 
        tauriStatus, 
        telemetry.measuredFlowMlhr, 
        telemetry.volRemainingMl,
        telemetry.maxVolumeMl, 
        telemetry.batteryPct, 
        DROP_FACTOR, 
        telemetry.targetMlhr
    );
    unlockTelemetry();

    if (n <= 0 || n >= (int)sizeof(json)) {
        Serial.println("[ESPNOW] Error formatting JSON buffer");
        return;
    }

    // Broadcast the packet
    esp_err_t sendResult = esp_now_send(RECEIVER_MAC, (const uint8_t *)json, strlen(json) + 1);
    
    // Save the status result
    lockTelemetry();
    strcpy(telemetry.lastTxResult, (sendResult == ESP_OK) ? "OK" : "FAIL");
    unlockTelemetry();

    // Print to local USB console for debugging
    Serial.printf("[TX] %s | esp_now=%s\n", json, (sendResult == ESP_OK) ? "OK" : "FAIL");
}
