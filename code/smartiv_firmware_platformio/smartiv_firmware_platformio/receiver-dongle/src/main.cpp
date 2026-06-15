// ============================================================================
// Smart IV ESP-NOW USB Receiver - PlatformIO
// ----------------------------------------------------------------------------
// Receives ESP-NOW payloads from bedside units and prints ONE RAW JSON object per
// line to USB Serial. This is what the Tauri/Rust serial reader should parse.
//
// Do not add "DATA:" prefix unless your desktop serial parser strips it.
// ============================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_arduino_version.h>

#define MAX_PACKET_SIZE 256
static const uint8_t ESPNOW_CHANNEL = 1;
static const bool DEBUG_LOGS = false;  // keep false for production desktop parser

typedef struct {
  char payload[MAX_PACKET_SIZE];
} ESPNowPacket;

#if ESP_ARDUINO_VERSION_MAJOR >= 3
void onDataReceived(const esp_now_recv_info *info, const uint8_t *data, int dataLen) {
  const uint8_t *srcMac = info ? info->src_addr : nullptr;
#else
void onDataReceived(const uint8_t *srcMac, const uint8_t *data, int dataLen) {
#endif
  if (dataLen <= 0) return;

  ESPNowPacket incomingPacket;
  memset(&incomingPacket, 0, sizeof(incomingPacket));

  int copyLen = min(dataLen, (int)sizeof(incomingPacket));
  memcpy(&incomingPacket, data, copyLen);
  incomingPacket.payload[MAX_PACKET_SIZE - 1] = '\0';

  // RAW JSON ONLY. Desktop Rust can parse this line directly with serde_json.
  Serial.println(incomingPacket.payload);

  if (DEBUG_LOGS && srcMac != nullptr) {
    // Keep disabled unless you are using a human serial monitor, because these
    // extra lines are not JSON and can disturb strict parsers.
    Serial.print("[RX from ");
    for (int i = 0; i < 6; i++) {
      if (i) Serial.print(":");
      Serial.printf("%02X", srcMac[i]);
    }
    Serial.println("]");
  }
}


void setup() {
  Serial.begin(115200);
  delay(500);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(100);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (DEBUG_LOGS) {
    Serial.println("[RECEIVER] Smart IV USB receiver booting...");
    Serial.print("[RECEIVER] MAC Address: ");
    Serial.println(WiFi.macAddress());
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
