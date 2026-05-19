#ifndef SENSOR_HELPER_H
#define SENSOR_HELPER_H

#include <Arduino.h>
#include <DHT.h>
#include <ArduinoJson.h>

/**
 * @brief Struct to hold all sensor data together for easy access and transmission.
 * This allows to keep the sensor reading logic separate from the data handling logic in the main loop.
 *
 * @note The specific sensors and their data types can be adjusted based on the actual sensors used in the project.
 */
struct SensorData
{
    String timestamp;
    float dhtHumidity;
    float dhtTemperature;
    float dhtHeatIndex;
    int flameAnalog;
    bool flameDigital;
    int thermistorAnalog;
    bool thermistorDigital;
    float thermistorTemp;
};

/**
 * @brief Initialize all sensors.
 * This function sets up the pin modes and initializes any sensor-specific settings (like starting the DHT sensor).
 *
 * @note Depending on the sensors used, additional initialization steps may be required (e.g., calibration).
 */
void initSensors();

/**
 * @brief Read all sensor values.
 * This function reads the current values from all sensors and returns them in a SensorData struct.
 *
 * @return SensorData struct containing the latest readings from all sensors.
 *
 * @note The function assumes that the sensors are properly initialized and that the pin modes are set correctly.
 */
SensorData readSensors();

/**
 * @brief Calculate the mean of an array of SensorData objects.
 *
 * - takes the timestamp from the newest reading (last one in the sequential list)
 *
 * - averages the numerical values
 *
 * - for digital boolean values, uses majority voting (true if more than half are true)
 *
 * @param dataList Array of SensorData objects
 * @param count Number of objects in the array
 * @return A new SensorData struct containing the mean values
 */
SensorData getMeanSensorData(const SensorData *dataList, int count);

/**
 * @brief Read sensors multiple times with a delay and return the mean values.
 *
 * @param n Number of times to read the sensors
 * @param t Delay in milliseconds between each read
 * @return A SensorData struct containing the smoothed (mean) values
 *
 * @note if n is 0 or negative, returns a single new reading without averaging.
 */
SensorData readSensorsAveraged(int n, int t);

/**
 * @brief Build a JSON string from the sensor data.
 * This function takes a SensorData struct and constructs a JSON string that can be transmitted to the server.
 *
 * @param data The SensorData struct containing the latest sensor readings.
 * @return A JSON string representation of the sensor data, including device ID and location information.
 *
 * @note The JSON structure can be adjusted based on the requirements of the server or the data format expected by the backend.
 */
String buildJsonString(const SensorData &data);

/**
 * @brief Steinhart-Hart conversion for thermistor.
 * This function converts the raw ADC value from the thermistor into a temperature in Celsius using the Steinhart-Hart equation.
 *
 * @note Assumes a 10k thermistor with a 10k pull-up resistor and specific A, B, C coefficients.
 * Adjust the coefficients and resistor values as needed for different thermistor models or circuit configurations.
 *
 * @param adcValue The raw ADC value read from the thermistor.
 * @return The calculated temperature in degree Celsius.
 */
float thermistorSteinhartHart(int adcValue);

#endif