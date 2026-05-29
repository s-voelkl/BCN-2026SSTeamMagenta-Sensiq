#include "TimeHelper.h"

/**
 * @brief Synchronizes the MCU's internal clock with an NTP server.
 * This is crucial for accurate timestamps in sensor data and for validating TLS
 * certificates during MQTT communication.
 *
 * @note The function will block until the time is successfully synchronized, which
 * may take a few seconds depending on network conditions.
 * It uses the configTime function to set up NTP synchronization and waits until a
 * valid time is obtained before proceeding.
 *
 * @warning A stable Wifi connection is required.
 */
void syncTime()
{
    Serial.print("Synchronizing time...");

    // configures the Network Time Protocol (NTP) client with Greenwich Mean Time (GMT) offset of 0 seconds (UTC).
    // Primary and secondary NTP servers are specified for redundancy.
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");

    // seconds since unix epoch (Jan 1, 1970)
    time_t now = time(nullptr);

    // Wait until the time is greater than Jan 1, 2020 (1577836800 seconds since epoch)
    while (now < 1577836800)
    {
        delay(500);
        Serial.print(".");
        now = time(nullptr);
    }
    Serial.println("\nTime synchronized.");
}
