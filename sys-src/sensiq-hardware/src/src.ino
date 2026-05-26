#include "WifiConnection.h"
#include "MqttConnection.h"
#include "SensorHelper.h"
#include "TimeHelper.h"
#include <AUnit.h>

// Set to 1 to run AUnit tests; set 0 for main functionality.
#define RUN_TESTS 0

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

  // Handle MQTT communication and keep alive
  loopMQTT();

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
