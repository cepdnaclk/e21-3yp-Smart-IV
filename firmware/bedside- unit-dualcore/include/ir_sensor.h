#ifndef IR_SENSOR_H
#define IR_SENSOR_H

void initIRSensor();
void pollIRSensor(); // Check the physical pin for drops (called in Core 1 control loop)
void resetIRStats();

// Make these variables visible to our flow calculations
extern unsigned long lastAcceptedDropMs;
extern unsigned long acceptedDrops;
extern unsigned long emaIntervalUs;
extern bool hasInterval;
extern unsigned long rawEdges;

#endif
