#include "SensorHelper.h"
#include "config.h"

// Pins definieren (intern in dieser Datei)
#define DHTTYPE DHT11
#define DHT_PIN 4
#define FLAME_ANALOG 34
#define FLAME_DIGITAL 35
#define THERMISTOR_ANALOG 32
#define THERMISTOR_DIGITAL 33

DHT dht11(DHT_PIN, DHTTYPE);

/**
 * @brief Initialize all sensors.
 * This function sets up the pin modes and initializes any sensor-specific settings (like starting the DHT sensor).
 *
 * @note Depending on the sensors used, additional initialization steps may be required (e.g., calibration).
 */
void initSensors()
{
    pinMode(DHT_PIN, INPUT);
    pinMode(FLAME_ANALOG, INPUT);
    pinMode(FLAME_DIGITAL, INPUT);
    pinMode(THERMISTOR_ANALOG, INPUT);
    pinMode(THERMISTOR_DIGITAL, INPUT);
    // pinMode(LED_BUILTIN, OUTPUT);

    // init DHT11 sensor
    dht11.begin();

    Serial.println("Sensors initialized.");
}

/**
 * @brief Read all sensor values.
 * This function reads the current values from all sensors and returns them in a SensorData struct.
 *
 * @return SensorData struct containing the latest readings from all sensors.
 *
 * @note The function assumes that the sensors are properly initialized and that the pin modes are set correctly.
 */
SensorData readSensors()
{
    SensorData data;

    // current time as ISO 8601 string
    time_t now = time(nullptr);
    struct tm *timeinfo = localtime(&now);
    char timeStr[64];
    strftime(timeStr, sizeof(timeStr), "%Y-%m-%dT%H:%M:%SZ", timeinfo);
    data.timestamp = String(timeStr);

    // dht11 sensor
    data.dhtHumidity = dht11.readHumidity();
    data.dhtTemperature = dht11.readTemperature();

    if (isnan(data.dhtHumidity) || isnan(data.dhtTemperature))
    {
        Serial.println("DHT11 value read failed!");
    }
    else
    {
        // calculate heat index in Celsius (True for Fahrenheit)
        data.dhtHeatIndex = dht11.computeHeatIndex(data.dhtTemperature, data.dhtHumidity, false);
    }

    // flame sensor. Inverting analog value for better readability (higher value = more flame).
    // 4095 is the max analog value for ESP32 (12-bit ADC), so the range is 0-4095.
    data.flameAnalog = 4095 - analogRead(FLAME_ANALOG);
    data.flameDigital = digitalRead(FLAME_DIGITAL);

    // thermistor sensor. Inverting analog value for better readability (higher value = higher temperature).
    float thermistorAdcValue = 4095 - analogRead(THERMISTOR_ANALOG);

    data.thermistorAnalog = thermistorAdcValue;
    data.thermistorDigital = digitalRead(THERMISTOR_DIGITAL);

    // thermistor specific conversion
    data.thermistorTemp = thermistorSteinhartHart(thermistorAdcValue);

    return data;
}

/**
 * @brief Steinhart-Hart conversion for thermistor.
 * This function converts the raw ADC value from the thermistor into a temperature in Celsius using the Steinhart-Hart equation.
 *
 * @note Assumes a 10k thermistor with a 10k pull-down resistor and specific A, B, C coefficients.
 * Adjust the coefficients and resistor values as needed for different thermistor models or circuit configurations.
 *
 * @param adcValue The raw ADC value read from the thermistor. Between 0 and 4095 for a 12-bit ADC.
 * @return The calculated temperature in degree Celsius.
 */
float thermistorSteinhartHart(int adcValue)
{
    // Avoid division by zero.
    if (adcValue <= 0)
    {
        adcValue = 1;
    }

    // calculate resistance (assuming a 10k pull-down resistor and 3.3V supply)
    float resistance = 10000.0 * (4095.0 / adcValue - 1.0);

    // Steinhart-Hart equation for thermistor conversion
    float logR = log(resistance);
    float temperatureKelvin;

    // A, B, and C coefficients
    float A = 0.001129148;
    float B = 0.000234125;
    float C = 0.0000000876741;

    // formula: 1/T = A + B*log(R) + C*(log(R)^3)
    temperatureKelvin = 1.0 / (A + (B * logR) + (C * logR * logR * logR));

    // convert Kelvin to Celsius
    return temperatureKelvin - 273.15;
}

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
SensorData getMeanSensorData(const SensorData *dataList, int count)
{
    SensorData meanData;
    if (count == 0)
    {
        return meanData;
    }

    // newest timestamp is the last one in the sequential list
    meanData.timestamp = dataList[count - 1].timestamp;

    float dhtHumSum = 0, dhtTempSum = 0, dhtHeatIndexSum = 0, thermistorTempSum = 0;
    long flameAnalogSum = 0, thermistorAnalogSum = 0;
    int flameDigitalSum = 0, thermistorDigitalSum = 0;

    for (int i = 0; i < count; i++)
    {
        dhtHumSum += dataList[i].dhtHumidity;
        dhtTempSum += dataList[i].dhtTemperature;
        dhtHeatIndexSum += dataList[i].dhtHeatIndex;
        flameAnalogSum += dataList[i].flameAnalog;
        flameDigitalSum += dataList[i].flameDigital ? 1 : 0; // bool to int
        thermistorAnalogSum += dataList[i].thermistorAnalog;
        thermistorDigitalSum += dataList[i].thermistorDigital ? 1 : 0;
        thermistorTempSum += dataList[i].thermistorTemp;
    }

    meanData.dhtHumidity = dhtHumSum / count;
    meanData.dhtTemperature = dhtTempSum / count;
    meanData.dhtHeatIndex = dhtHeatIndexSum / count;
    meanData.flameAnalog = flameAnalogSum / count;
    meanData.flameDigital = (flameDigitalSum > count / 2); // majority voting
    meanData.thermistorAnalog = thermistorAnalogSum / count;
    meanData.thermistorDigital = (thermistorDigitalSum > count / 2);
    meanData.thermistorTemp = thermistorTempSum / count;

    return meanData;
}

/**
 * @brief Read sensors multiple times with a delay and return the mean values.
 * Runs readSensors() n times with a delay of t milliseconds between each read, then
 * returns the mean of the readings via the getMeanSensorData function as a SensorData struct.
 *
 * @param n Number of times to read the sensors
 * @param t Delay in milliseconds between each read
 * @return A SensorData struct containing the smoothed (mean) values
 *
 * @note if n is 0 or negative, returns a single new reading without averaging.
 */
SensorData readSensorsAveraged(int n, int t)
{
    if (n <= 0)
        return readSensors();

    SensorData *dataList = new SensorData[n];
    for (int i = 0; i < n; i++)
    {
        dataList[i] = readSensors();
        if (i < n - 1)
        {
            delay(t);
        }
    }

    SensorData result = getMeanSensorData(dataList, n);
    // Clean up dynamically allocated memory
    delete[] dataList;
    return result;
}

/**
 * @brief Build a JSON string from the sensor data.
 * This function takes a SensorData struct and constructs a JSON string that can be transmitted to the server.
 *
 * @param data The SensorData struct containing the latest sensor readings.
 * @return A JSON string representation of the sensor data, including device ID and location information.
 *
 * @note The JSON structure can be adjusted based on the requirements of the server or the data format expected by the backend.
 */
String buildJsonString(const SensorData &data)
{
    // building JSON
    JsonDocument doc;

    doc["running_time"] = millis(); // after circa 50 days, this will overflow and reset to 0.
    doc["timestamp"] = data.timestamp;
    doc["device_id"] = device_id;
    doc["location"] = device_location;
    doc["dht_humidity"] = data.dhtHumidity;
    doc["dht_temperature"] = data.dhtTemperature;
    doc["dht_heat_index"] = data.dhtHeatIndex;
    doc["flame_analog"] = data.flameAnalog;
    doc["flame_digital"] = data.flameDigital;
    doc["thermistor_analog"] = data.thermistorAnalog;
    doc["thermistor_digital"] = data.thermistorDigital;
    doc["thermistor_temp"] = data.thermistorTemp;

    // Serialize JSON to string
    String json_output;
    serializeJson(doc, json_output);
    return json_output;
}
