#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// -------------------- Bedside Identity & Network --------------------
#define BED_ID "03"
#define ESPNOW_CHANNEL 1
static uint8_t RECEIVER_MAC[6] = {0xAC, 0xA7, 0x04, 0x27, 0xB8, 0x38}; 

// -------------------- LCD (I2C) Pins --------------------
#define LCD_ADDR 0x27 // Change to 0x3F if your screen is blank but lit
#define LCD_COLS 16
#define LCD_ROWS 4
#define I2C_SDA 21
#define I2C_SCL 22

// -------------------- Keypad Matrix Pins --------------------
#define KEYPAD_ROWS 4
#define KEYPAD_COLS 4

// -------------------- Stepper Motor (TMC2208) Pins --------------------
#define PIN_STEP 25
#define PIN_DIR 26
#define PIN_EN 27

// Stepper Motor Limits & Constants
#define DIR_CLOSE_LEVEL HIGH
#define DIR_OPEN_LEVEL (!DIR_CLOSE_LEVEL)
#define CLAMP_OPEN_POS 0
#define CLAMP_CLOSED_POS 600
#define CORRECTION_STEPS 5
#define STEP_DELAY_US 650
#define CONTROL_INTERVAL_MS 1800
#define FLOW_TOLERANCE_MLHR 8.0f

// -------------------- IR Drop Sensor Pin --------------------
#define PIN_IR 34  // GPIO 34 (requires external 10k pull-up resistor)
#define BLOCKAGE_TIMEOUT_MS 12000UL
#define DROP_FACTOR 20   // drops per mL

#define SIMULATE_FLOW 0  // 1 = Simulation mode, 0 = Real physical sensor mode

#endif
