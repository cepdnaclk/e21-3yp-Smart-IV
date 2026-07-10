#include "ir_sensor.h"
#include "config.h"

// Define the sensor state variables
unsigned long lastAcceptedDropMs = 0;
unsigned long acceptedDrops = 0;
unsigned long emaIntervalUs = 0;
bool hasInterval = false;
unsigned long rawEdges = 0;

static bool irIdleLevel = HIGH;
static bool irWasActive = false;
static unsigned long isrLastAcceptedUs = 0;
static constexpr unsigned long MIN_DROP_GAP_MS = 300;
static constexpr unsigned long MIN_EDGE_GAP_US = 180000UL;

void initIRSensor() {
    pinMode(PIN_IR, INPUT);
    
    // Calibrate baseline state when the device turns on (usually HIGH)
    irIdleLevel = digitalRead(PIN_IR);
    irWasActive = false;
}

// Polling check: reads the pin, detects transitions, and filters noise
void pollIRSensor() {
    bool level = digitalRead(PIN_IR);
    bool active = (level != irIdleLevel);

    // Detect transition from idle to active (drop passing through light beam)
    if (active && !irWasActive) {
        rawEdges++;
        unsigned long nowMs = millis();
        unsigned long nowUs = micros();

        // Layer 1 Filter: Reject macro-bounce faster than 300ms
        if (nowMs - lastAcceptedDropMs >= MIN_DROP_GAP_MS) {
            Serial.printf("[IR] Drop/Object detected! Total: %lu\n", acceptedDrops + 1);
            if (isrLastAcceptedUs > 0) {
                unsigned long interval = nowUs - isrLastAcceptedUs;
                
                // Layer 2 Filter: Reject micro-chatter/noise spikes
                if (interval > MIN_EDGE_GAP_US) {
                    if (!hasInterval) {
                        emaIntervalUs = interval;
                        hasInterval = true;
                    } else {
                        // Exponential Moving Average (EMA) to smooth the interval values
                        emaIntervalUs = (emaIntervalUs * 3UL + interval) / 4UL;
                    }
                }
            }
            isrLastAcceptedUs = nowUs;
            acceptedDrops++;
            lastAcceptedDropMs = nowMs;
        }
    }
    irWasActive = active;
}

void resetIRStats() {
    lastAcceptedDropMs = 0;
    acceptedDrops = 0;
    emaIntervalUs = 0;
    hasInterval = false;
    rawEdges = 0;
    isrLastAcceptedUs = 0;
    irWasActive = false;
}
