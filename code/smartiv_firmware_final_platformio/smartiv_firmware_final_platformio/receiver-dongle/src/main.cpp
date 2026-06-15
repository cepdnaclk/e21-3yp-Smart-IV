// ============================================================================
// Smart IV ESP-NOW USB Receiver - ESP32-S3-N16R8 - PlatformIO
// ----------------------------------------------------------------------------
// Receives ESP-NOW payloads from bedside units and prints ONE RAW JSON object per
// line to USB Serial. This is what the Tauri/Rust serial reader should parse.
//
// Keep RECEIVER_DEBUG = 0 for the desktop app. If you need human boot logs,
// change -DRECEIVER_DEBUG=1 in platformio.ini, upload, observe, then set back to 0.
// ============================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#ifndef RECEIVER_DEBUG
#define RECEIVER_DEBUG 0
#endif

#define MAX_PACKET_SIZE 240
static const uint8_t ESPNOW_CHANNEL = 1;
static const bool DEBUG_LOGS = RECEIVER_DEBUG;

static void printMac(const uint8_t *mac) {
  for (int i = 0; i < 6; i++) {
    if (i) Serial.print(":");
    Serial.printf("%02X", mac[i]);
  }
}

// Arduino-ESP32 v2/v3 compatible receive callback handling.
#if ESP_ARDUINO_VERSION_MAJOR >= 3
void onDataReceived(const esp_now_recv_info_t *info, const uint8_t *data, int dataLen) {
  if (dataLen <= 0) return;

  char payload[MAX_PACKET_SIZE + 1];
  memset(payload, 0, sizeof(payload));
  int copyLen = min(dataLen, MAX_PACKET_SIZE);
  memcpy(payload, data, copyLen);
  payload[copyLen] = '\0';

  // RAW JSON ONLY. Desktop Rust can parse this line directly with serde_json.
  Serial.println(payload);

  if (DEBUG_LOGS && info != nullptr) {
    Serial.print("[RX from ");
    printMac(info->src_addr);
    Serial.print("] bytes=");
    Serial.println(dataLen);
  }
}
#else
void onDataReceived(const uint8_t *mac, const uint8_t *data, int dataLen) {
  if (dataLen <= 0) return;

  char payload[MAX_PACKET_SIZE + 1];
  memset(payload, 0, sizeof(payload));
  int copyLen = min(dataLen, MAX_PACKET_SIZE);
  memcpy(payload, data, copyLen);
  payload[copyLen] = '\0';

  // RAW JSON ONLY. Desktop Rust can parse this line directly with serde_json.
  Serial.println(payload);

  if (DEBUG_LOGS && mac != nullptr) {
    Serial.print("[RX from ");
    printMac(mac);
    Serial.print("] bytes=");
    Serial.println(dataLen);
  }
}
#endif

void setup() {
  Serial.begin(115200);
  delay(1200); // ESP32-S3 native USB CDC needs a short delay after boot.

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(100);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (DEBUG_LOGS) {
    Serial.println("[RECEIVER] Smart IV ESP32-S3 USB receiver booting...");
    Serial.print("[RECEIVER] WiFi STA MAC: ");
    Serial.println(WiFi.macAddress());
    Serial.print("[RECEIVER] Channel: ");
    Serial.println(ESPNOW_CHANNEL);
  }

  if (esp_now_init() != ESP_OK) {
    if (DEBUG_LOGS) Serial.println("[ERROR] ESP-NOW init failed");
    return;
  }

  esp_now_register_recv_cb(onDataReceived);

  if (DEBUG_LOGS) {
    Serial.println("[RECEIVER] ESP-NOW ready. Raw JSON output mode.");
  }
}

void loop() {
  delay(1000);
}
