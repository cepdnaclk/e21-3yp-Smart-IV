#ifndef UI_CONTROL_H
#define UI_CONTROL_H

void initUI();
void updateUI(); // Updates the LCD screen layout (called in Core 0)
void handleKeypadInput(); // Reads the keypad (called in Core 0)
void updateVolumeTelemetry(unsigned long deltaMs); // Calculates bag volume over time

#endif
