// ============================================================
// Smart IV — IR Drop Counter v2
// Correct logic: one drop = FALLING edge + RISING edge (full pass)
// GPIO 34 = IR Receiver OUT
// Serial prints ONLY when a drop is confirmed
// ============================================================

#define IR_RECEIVER_PIN  34
#define DEBOUNCE_MS      20   // ms — ignore noise shorter than this

// State machine states
#define STATE_IDLE     0   // beam clear, waiting for blockage
#define STATE_WAITING  1   // beam blocked, waiting for restoration

volatile uint8_t       dropState        = STATE_IDLE;
volatile int           dropCount        = 0;
volatile bool          newDrop          = false;
volatile unsigned long lastEdgeTime     = 0;

// -----------------------------------------------
// Single ISR — fires on ANY edge (CHANGE)
// -----------------------------------------------
void IRAM_ATTR onIRChange() {
  unsigned long now = millis();

  // Debounce: ignore if edge came too soon after last one
  if ((now - lastEdgeTime) < DEBOUNCE_MS) return;
  lastEdgeTime = now;

  int pin = digitalRead(IR_RECEIVER_PIN);

  if (dropState == STATE_IDLE && pin == LOW) {
    // Beam just got blocked — droplet entering
    dropState = STATE_WAITING;

  } else if (dropState == STATE_WAITING && pin == HIGH) {
    // Beam restored — droplet has fully passed → count it
    dropCount++;
    newDrop   = true;
    dropState = STATE_IDLE;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(IR_RECEIVER_PIN, INPUT);  // GPIO 34 is input-only, no PULLUP
  attachInterrupt(digitalPinToInterrupt(IR_RECEIVER_PIN),
                  onIRChange, CHANGE);
}

void loop() {
  if (newDrop) {
    newDrop = false;
    Serial.print("Drop detected | Total: ");
    Serial.println(dropCount);
  }
}