#include "WifiConnection.h"
#include "MqttConnection.h"
#include "SensorHelper.h"
#include <AUnit.h>

// Set to 1 to run AUnit tests; set 0 for main functionality.
#define RUN_TESTS 0

/**
 * @brief Synchronizes the MCU's internal clock with an NTP server.
 * This is crucial for accurate timestamps in sensor data and for validating TLS certificates during MQTT communication.
 *
 * @note The function will block until the time is successfully synchronized, which may take a few seconds depending on network conditions.
 * It uses the configTime function to set up NTP synchronization and waits until a valid time is obtained before proceeding.

 * @warning A stable Wifi connection is required.
 */  
void syncTime() {
  Serial.print("Synchronizing time...");

  // configures the Network Time Protocol (NTP) client with Greenwich Mean Time (GMT) offset of 0 seconds (UTC).
  // Primary and secondary NTP servers are specified for redundancy. 
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  
  // seconds since unix epoch (Jan 1, 1970)
  time_t now = time(nullptr);
  // Wait until the time is greater than Jan 1, 2020 (1577836800 seconds since epoch)
  while (now < 1577836800) {
      delay(500);
      Serial.print(".");
      now = time(nullptr);
  }
  Serial.println("\nTime synchronized.");
}

/**
 * @brief Main setup function for the MCU controller.
 * This function initializes the serial communication, connects to WiFi and MQTT, and initializes all sensors.
 */
void setup() {
  Serial.begin(115200, SERIAL_8N1);
  
#if RUN_TESTS
  delay(1000); // serial initialization delay for test output
  Serial.println("Starting AUnit tests...");
#else
  // Connect to WiFi
  connectToWiFi();

  // Synchronize time (required for TLS certificate validation and timestamps).
  syncTime();

  // Initialize sensors
  initSensors();

  // Setup MQTT client
  setupMQTT();
#endif
}

/**
 * @brief Main loop function for the MCU controller.
 * This function runs continuously after setup.
 */
void loop() {
#if RUN_TESTS
  aunit::TestRunner::run();
#else
  int n_readings = 5;
  int t_delay_ms = 1000; 

  // Ensure the MQTT connection is active
  connectToMQTT();

  // Read smoothed sensor values. 
  // Take n samples with t milliseconds delay between samples and average to reduce noise.
  SensorData sensorData = readSensorsAveraged(n_readings, t_delay_ms);

  String json_output = buildJsonString(sensorData);
  Serial.println(json_output);

  // Publish to MQTT Broker
  publishMQTTData(json_output);
  
  // one delay is needed to ensure last reading is different from next reading, 
  // otherwise the same value might be read again due to sensor update intervals.
  delay(t_delay_ms);
#endif
}
