#include "SensorHelper.h"
#include "../config.h"

#include "Adafruit_BME680.h"
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <ArduinoJson.h>

// Pins definieren (intern in dieser Datei)
#define DHTTYPE DHT11
#define DHT_PIN 4
// KY-026 flame sensor: analog and digital pins
#define FLAME_ANALOG 34
#define FLAME_DIGITAL 35
// KY-028 thermistor sensor: analog and digital pins
#define THERMISTOR_ANALOG 32
#define THERMISTOR_DIGITAL 33
// Switches for outlier marking and training data collection
#define SWITCH_OUTLIER_PIN 25
#define SWITCH_TRAINING_PIN 26
// Using SPI for BME680 sensor
#define BME_SCL 18
#define BME_SDO_MISO 19
#define BME_SDA_MOSI 23
#define BME_CS 5
// using I2C for TSL2561 light sensor
#define TSL_SCL 22
#define TSL_SDA 21

#define SEALEVELPRESSURE_HPA (1013.25)

// Sensor instances
DHT dht11(DHT_PIN, DHTTYPE);
Adafruit_BME680 bme(BME_CS, BME_SDA_MOSI, BME_SDO_MISO, BME_SCL);

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

    // Switches with internal Pull-Up Resistor.
    // 1 if cables open, so switch not pressed.
    // 0 if cables closed, so switch pressed.
    pinMode(SWITCH_OUTLIER_PIN, INPUT_PULLUP);
    pinMode(SWITCH_TRAINING_PIN, INPUT_PULLUP);

    // init DHT11 sensor
    dht11.begin();

    // BME680 setup: oversampling and filter initialization
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150); // 320*C for 150 ms

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
    int runningSinceMs = millis();
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
        data.dhtHeatIndex = NAN;
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

    // read switches (inverted logic due to pull-up resistors)
    data.isOutlier = (digitalRead(SWITCH_OUTLIER_PIN) == LOW);
    data.collectTraining = (digitalRead(SWITCH_TRAINING_PIN) == LOW);

    // BME680 should be run at least 30 minutes for accurate readings.
    data.bmeHeatedUp = (runningSinceMs >= 30 * 60 * 1000);

    // BME680 measurement
    if (bme.performReading())
    {
        data.bmeTemperature = bme.temperature;
        data.bmeHumidity = bme.humidity;
        data.bmePressure = bme.pressure / 100.0; // convert Pa to hPa
        data.bmeAltitude = bme.readAltitude(SEALEVELPRESSURE_HPA);
        data.bmeVOC = bme.gas_resistance / 1000.0; // convert Ohms to KOhms
    }
    else
    {
        Serial.println("BME680 reading failed!");
        data.bmeTemperature = NAN;
        data.bmeHumidity = NAN;
        data.bmePressure = NAN;
        data.bmeAltitude = NAN;
        data.bmeVOC = NAN;
    }

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
    int flameDigitalSum = 0, thermistorDigitalSum = 0, isOutlierSum = 0, collectTrainingSum = 0;
    float bmeTempSum = 0, bmeHumSum = 0, bmePresSum = 0, bmeAltSum = 0, bmeVocSum = 0;
    int bmeHeatedUpSum = 0;

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
        isOutlierSum += dataList[i].isOutlier ? 1 : 0;
        collectTrainingSum += dataList[i].collectTraining ? 1 : 0;

        bmeTempSum += isnan(dataList[i].bmeTemperature) ? 0 : dataList[i].bmeTemperature;
        bmeHumSum += isnan(dataList[i].bmeHumidity) ? 0 : dataList[i].bmeHumidity;
        bmePresSum += isnan(dataList[i].bmePressure) ? 0 : dataList[i].bmePressure;
        bmeAltSum += isnan(dataList[i].bmeAltitude) ? 0 : dataList[i].bmeAltitude;
        bmeVocSum += isnan(dataList[i].bmeVOC) ? 0 : dataList[i].bmeVOC;
        bmeHeatedUpSum += dataList[i].bmeHeatedUp ? 1 : 0;
    }

    meanData.dhtHumidity = dhtHumSum / count;
    meanData.dhtTemperature = dhtTempSum / count;
    meanData.dhtHeatIndex = dhtHeatIndexSum / count;
    meanData.flameAnalog = flameAnalogSum / count;
    meanData.flameDigital = (flameDigitalSum > count / 2); // majority voting
    meanData.thermistorAnalog = thermistorAnalogSum / count;
    meanData.thermistorDigital = (thermistorDigitalSum > count / 2);
    meanData.thermistorTemp = thermistorTempSum / count;
    meanData.isOutlier = (isOutlierSum > count / 2);
    meanData.collectTraining = (collectTrainingSum > count / 2);

    meanData.bmeTemperature = bmeTempSum / count;
    meanData.bmeHumidity = bmeHumSum / count;
    meanData.bmePressure = bmePresSum / count;
    meanData.bmeAltitude = bmeAltSum / count;
    meanData.bmeVOC = bmeVocSum / count;
    meanData.bmeHeatedUp = (bmeHeatedUpSum > count / 2);

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

    doc["bme_heated_up"] = data.bmeHeatedUp;
    doc["bme_temperature"] = data.bmeTemperature;
    doc["bme_humidity"] = data.bmeHumidity;
    doc["bme_pressure"] = data.bmePressure;
    doc["bme_altitude"] = data.bmeAltitude;
    doc["bme_voc"] = data.bmeVOC;

    doc["is_outlier"] = data.isOutlier;
    doc["collect_training"] = data.collectTraining;

    // Serialize JSON to string
    String json_output;
    serializeJson(doc, json_output);
    return json_output;
}
