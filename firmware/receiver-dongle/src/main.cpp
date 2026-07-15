#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#if __has_include(<esp_arduino_version.h>)
  #include <esp_arduino_version.h>
#endif

// Set this to 'true' only if you are testing manually in the serial monitor.
// KEEP IT 'false' when connecting to the Tauri desktop app.
static const bool DEBUG_LOGS = false; 
static constexpr uint8_t ESPNOW_CHANNEL = 1;
static constexpr uint16_t MAX_JSON_LEN = 240;

static void printMac(const uint8_t *mac) {
    for (int i = 0; i < 6; i++) {
        if (i) Serial.print(":");
        if (mac[i] < 16) Serial.print("0");
        Serial.print(mac[i], HEX);
    }
}

static void handlePacket(const uint8_t *senderMac, const uint8_t *data, int len) {
    if (len <= 0 || len >= MAX_JSON_LEN) {
        if (DEBUG_LOGS) {
            Serial.printf("[RX] Ignored packet with invalid length: %d\n", len);
        }
        return;
    }

    // Convert data bytes to a null-terminated JSON string
    char json[MAX_JSON_LEN + 1];
    memcpy(json, data, len);
    json[len] = '\0';

    // The Tauri app parses lines starting with '{'
    if (json[0] == '{') {
        Serial.println(json); // Print raw JSON to USB Serial
    } else if (DEBUG_LOGS) {
        Serial.print("[RX] Non-JSON data from: ");
        printMac(senderMac);
        Serial.printf(" | Len: %d | Data: %s\n", len, json);
    }
}

// Receive callback signature for ESP32 Core v3
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
    const uint8_t *mac = info ? info->src_addr : nullptr;
    static const uint8_t zeroMac[6] = {0,0,0,0,0,0};
    handlePacket(mac ? mac : zeroMac, data, len);
}
#else
// Receive callback signature for ESP32 Core v2
void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    static const uint8_t zeroMac[6] = {0,0,0,0,0,0};
    handlePacket(mac ? mac : zeroMac, data, len);
}
#endif

void setup() {
    Serial.begin(115200);
    
    // S3 Native USB connection stabilization
    delay(1000);

    if (DEBUG_LOGS) {
        Serial.println("\n[RECEIVER] Booting Smart IV Receiver Dongle...");
    }

    // Force Wi-Fi to Station Mode and set channel
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    delay(200);

    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    if (DEBUG_LOGS) {
        Serial.printf("[RECEIVER] MAC Address: %s\n", WiFi.macAddress().c_str());
        Serial.printf("[RECEIVER] Wi-Fi Channel: %d\n", ESPNOW_CHANNEL);
    }

    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ERROR] ESP-NOW initialization failed!");
        delay(1000);
        ESP.restart();
    }

    // Register callback for when data is received
    esp_now_register_recv_cb(onDataRecv);

    if (DEBUG_LOGS) {
        Serial.println("[RECEIVER] Ready. Waiting for JSON telemetry packets...");
    }
}

void loop() {
    // We don't need any loop code; the ESP-NOW receive handler runs via interrupt callbacks!
    delay(100);
}
