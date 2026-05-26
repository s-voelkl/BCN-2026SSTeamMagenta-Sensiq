#ifndef TIME_HELPER_H
#define TIME_HELPER_H

#include <Arduino.h>
#include <time.h>

/**
 * @brief Synchronizes the MCU's internal clock with an NTP server.
 * This is crucial for accurate timestamps in sensor data and for validating TLS certificates during MQTT communication.
 *
 * @note The function will block until the time is successfully synchronized, which may take a few seconds depending on network conditions.
 * It uses the configTime function to set up NTP synchronization and waits until a valid time is obtained before proceeding.
 *
 * @warning A stable Wifi connection is required.
 */
void syncTime();

#endif // TIME_HELPER_H
