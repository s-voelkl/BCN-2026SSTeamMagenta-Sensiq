#ifndef WIFI_CONNECTION_H
#define WIFI_CONNECTION_H

/**
 * @brief Connect to the WiFi network using credentials from config.h.
 * This function attempts to connect to the specified WiFi network and blocks until a connection is established.
 *
 * @note Ensure that the WiFi credentials in config.h are correct and
 * that the network is within range for a successful connection.
 * Network connection is crucial for the functionality of the MCU, so blocking is acceptable in this context.
 *
 * @return true if the WiFi connection is successfully established.
 *
 * @warning If the WiFi connection fails (e.g., due to incorrect credentials or network issues),
 * the function will block indefinitely.
 */
bool connectToWiFi();

#endif