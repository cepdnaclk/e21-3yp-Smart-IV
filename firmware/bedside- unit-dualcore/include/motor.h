#ifndef MOTOR_H
#define MOTOR_H

void initMotor();
void openClamp(int steps);
void closeClamp(int steps);
void disableMotor(); // Low power standby mode

#endif
