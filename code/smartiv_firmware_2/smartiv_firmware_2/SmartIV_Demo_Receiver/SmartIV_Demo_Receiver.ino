// ============================================================
// SMART IV — DEMO RECEIVER DONGLE
// Board: ESP32-S3-N16R8 receiver
// Tool: Arduino IDE
// Purpose:
//   Receive ESP-NOW JSON from bedside ESP32 and print RAW JSON
//   to USB Serial for the latest Tauri/Rust desktop app.
//
// IMPORTANT FOR TAURI APP:
//   Final demo mode prints ONLY JSON lines. No DATA: prefix.
//   Keep DEBUG_LOGS = false when connecting to desktop app.
// ============================================================

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#if __has_include(<esp_arduino_version.h>)
  #include <esp_arduino_version.h>
#endif

static const bool DEBUG_LOGS = false;   // true only while testing in Serial Monitor
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
      Serial.print("[RX] ignored invalid len=");
      Serial.println(len);
    }
    return;
  }

  char json[MAX_JSON_LEN + 1];
  memcpy(json, data, len);
  json[len] = '\0';

  // If sender included a null terminator, trim after it.
  // This also protects Serial.println from garbage bytes.
  json[MAX_JSON_LEN] = '\0';

  // Print only JSON lines for the desktop parser.
  // Ignore accidental non-JSON debug packets.
  if (json[0] == '{') {
    Serial.println(json);
  } else if (DEBUG_LOGS) {
    Serial.print("[RX] non-json from ");
    printMac(senderMac);
    Serial.print(" len=");
    Serial.print(len);
    Serial.print(" data=");
    Serial.println(json);
  }

  if (DEBUG_LOGS) {
    Serial.print("[RX] packet from ");
    printMac(senderMac);
    Serial.print(" bytes=");
    Serial.println(len);
  }
}

// Arduino-ESP32 core v3 callback signature
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  const uint8_t *mac = info ? info->src_addr : nullptr;
  static const uint8_t zeroMac[6] = {0,0,0,0,0,0};
  handlePacket(mac ? mac : zeroMac, data, len);
}
#else
// Arduino-ESP32 core v2 callback signature
void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
  static const uint8_t zeroMac[6] = {0,0,0,0,0,0};
  handlePacket(mac ? mac : zeroMac, data, len);
}
#endif

void setup() {
  Serial.begin(115200);
  delay(1500);

  if (DEBUG_LOGS) {
    Serial.println();
    Serial.println("[RECEIVER] Smart IV demo receiver booting...");
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  delay(200);

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  if (DEBUG_LOGS) {
    Serial.print("[RECEIVER] MAC: ");
    Serial.println(WiFi.macAddress());
    Serial.print("[RECEIVER] ESPNOW channel: ");
    Serial.println(ESPNOW_CHANNEL);
  }

  if (esp_now_init() != ESP_OK) {
    // In final raw mode we still print this because otherwise debugging is impossible.
    Serial.println("[ERROR] ESP-NOW init failed");
    delay(1000);
    ESP.restart();
  }

  esp_now_register_recv_cb(onDataRecv);

  if (DEBUG_LOGS) {
    Serial.println("[RECEIVER] ESP-NOW ready. Waiting for raw JSON packets...");
  }
}

void loop() {
  if (DEBUG_LOGS) {
    static unsigned long last = 0;
    if (millis() - last > 5000) {
      last = millis();
      Serial.println("[RECEIVER] alive");
    }
  }
  delay(20);
}
