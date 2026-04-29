// ============================================================
//  SMART IV — ESP-NOW USB Receiver
//  Upload this to the ESP32 connected to your laptop via USB.
//  It receives JSON packets from bedside ESP32 units and
//  forwards them to the laptop over Serial (USB).
//
//  Baud rate: 115200
//  The Node.js app reads this Serial port and writes to JS file.
// ============================================================

#include <WiFi.h>
#include <esp_now.h>

// Maximum packet size (JSON string length)
#define MAX_PACKET_SIZE 256

// Structure must match exactly what the sender transmits
typedef struct {
  char payload[MAX_PACKET_SIZE];
} ESPNowPacket;

ESPNowPacket incomingPacket;

// ─────────────────────────────────────────────
//  Callback — fires when a packet is received
// ─────────────────────────────────────────────
void onDataReceived(const esp_now_recv_info *info, const uint8_t *data, int dataLen)
 {
  // Copy into our struct
  memcpy(&incomingPacket, data, dataLen);

  // Forward raw JSON to Serial so Node.js can read it
  // Prefix with "DATA:" so Node.js can distinguish from debug logs
  Serial.print("DATA:");
  Serial.println(incomingPacket.payload);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("[RECEIVER] Smart IV USB Receiver booting...");

  // ESP-NOW requires WiFi in station mode
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();   // don't connect to any AP

  Serial.print("[RECEIVER] My MAC Address: ");
  Serial.println(WiFi.macAddress());
  Serial.println("[RECEIVER] Give this MAC to the bedside ESP32 sender code.");

  // Init ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ERROR] ESP-NOW init failed!");
    return;
  }

  // Register receive callback
  esp_now_register_recv_cb(onDataReceived);

  Serial.println("[RECEIVER] ESP-NOW ready. Waiting for packets...");
  Serial.println("[RECEIVER] Packets will be printed as: DATA:{json}");
}

void loop() {
  // Nothing needed — all handled in the callback
  delay(10);
}
