#ifndef MQTT_CONNECTION_H
#define MQTT_CONNECTION_H

#include <Arduino.h>

/**
 * @brief Setup the MQTT client.
 * Configures the MQTT server and port based on the credentials in config.h.
 *
 * @note This function should be called once during the setup phase of the MCU to
 * initialize the MQTT client with the correct server settings and authentication credentials.
 */
void setupMQTT();

/**
 * @brief Handles background MQTT tasks.
 * Should be called in the main loop to process incoming messages and keep the connection alive.
 */
void loopMQTT();

/**
 * @brief Connects or reconnects to the MQTT broker.
 * This function handles connecting to the server using the configured credentials.
 */
void connectToMQTT();

/**
 * @brief Publishes data to the configured MQTT topic and subtopic.
 *
 * @param payload The string payload to publish.
 * @return true if published successfully, false otherwise.
 */
bool publishMQTTData(const String &payload);

#endif