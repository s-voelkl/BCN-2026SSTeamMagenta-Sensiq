#include "SensorHelper.h"
#include "../config.h"

#include <ArduinoJson.h>
#include <AUnit.h>

test(SensorHelper_buildJsonString_exportsCorrectJsonData)
{
    // Arrange: Create sample SensorData struct
    SensorData testData;
    testData.timestamp = "2026-05-14T12:00:00Z";
    testData.dhtHumidity = 50.5f;
    testData.dhtTemperature = 22.3f;
    testData.dhtHeatIndex = 22.0f;
    testData.flameAnalog = 3000;
    testData.flameDigital = true;
    testData.thermistorAnalog = 2000;
    testData.thermistorDigital = false;
    testData.thermistorTemp = 25.0f;
    testData.isOutlier = true;
    testData.collectTraining = false;
    testData.bmeHeatedUp = true;
    testData.bmeTemperature = 23.5f;
    testData.bmeHumidity = 45.0f;
    testData.bmePressure = 1010.5f;
    testData.bmeAltitude = 120.0f;
    testData.bmeVOC = 50.0f;
    testData.tslLux = 350.5f;

    String jsonResult = buildJsonString(testData);

    // Act: Parse it back to verify correctness
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, jsonResult);

    // Check that there is no parsing error
    assertEqual(error.code(), DeserializationError::Ok);

    // Assert: Verify properties
    assertEqual(doc["timestamp"].as<String>(), String("2026-05-14T12:00:00Z"));
    assertEqual(doc["device_id"].as<String>(), String(device_id));
    assertEqual(doc["location"].as<String>(), String(device_location));
    // use a margin of error for float comparisons of 0.01
    assertNear(doc["dht_humidity"].as<float>(), 50.5f, 0.01f);
    assertNear(doc["dht_temperature"].as<float>(), 22.3f, 0.01f);
    assertNear(doc["dht_heat_index"].as<float>(), 22.0f, 0.01f);
    assertEqual(doc["flame_analog"].as<int>(), 3000);
    assertTrue(doc["flame_digital"].as<bool>());
    assertEqual(doc["thermistor_analog"].as<int>(), 2000);
    assertFalse(doc["thermistor_digital"].as<bool>());
    assertNear(doc["thermistor_temp"].as<float>(), 25.0f, 0.01f);
    assertTrue(doc["is_outlier"].as<bool>());
    assertFalse(doc["collect_training"].as<bool>());

    assertTrue(doc["bme_heated_up"].as<bool>());
    assertNear(doc["bme_temperature"].as<float>(), 23.5f, 0.01f);
    assertNear(doc["bme_humidity"].as<float>(), 45.0f, 0.01f);
    assertNear(doc["bme_pressure"].as<float>(), 1010.5f, 0.01f);
    assertNear(doc["bme_altitude"].as<float>(), 120.0f, 0.01f);
    assertNear(doc["bme_voc"].as<float>(), 50.0f, 0.01f);
    assertNear(doc["tsl_lux"].as<float>(), 350.5f, 0.01f);

    // running_time should be present and valid
    assertTrue(doc.containsKey("running_time"));
}

test(SensorHelper_readSensorsMock_returnsValidData)
{
    // Act: Calling readSensors() directly to ensure it cleanly processes and returns a SensorData struct.
    // In a pure test environment without physical sensors connected, DHT values
    // are typically NaN, and analog/digital reads return default or floating states.
    SensorData data = readSensors();

    // Assert: Verify timestamp string is correctly formatted/populated
    assertNotEqual(data.timestamp.length(), (unsigned int)0);

    // Verify DHT values either return NaN (expected in tests) or a valid numeric value
    bool isHumidityNan = isnan(data.dhtHumidity);
    bool isTempNan = isnan(data.dhtTemperature);
    assertTrue(isHumidityNan || (data.dhtHumidity >= 0.0f && data.dhtHumidity <= 100.0f));
    assertTrue(isTempNan || (data.dhtTemperature >= -40.0f && data.dhtTemperature <= 125.0f));

    // For ESP32, analogRead returns values between 0 and 4095 (12-bit ADC by default)
    assertTrue(data.flameAnalog >= 0 && data.flameAnalog <= 4095);
    assertTrue(data.thermistorAnalog >= 0 && data.thermistorAnalog <= 4095);

    // Digital reads should naturally resolve to true or false
    assertTrue(data.flameDigital == true || data.flameDigital == false);
    assertTrue(data.thermistorDigital == true || data.thermistorDigital == false);

    // Verify thermistorTemp is within a reasonable range
    assertTrue(data.thermistorTemp >= -40.0f && data.thermistorTemp <= 125.0f);

    // Verify outlier and training flags are boolean
    assertTrue(data.isOutlier == true || data.isOutlier == false);
    assertTrue(data.collectTraining == true || data.collectTraining == false);

    // Verify BME680 values
    bool bmeTempNan = isnan(data.bmeTemperature);
    assertTrue(bmeTempNan || (data.bmeTemperature >= -40.0f && data.bmeTemperature <= 85.0f));
    bool bmeHumNan = isnan(data.bmeHumidity);
    assertTrue(bmeHumNan || (data.bmeHumidity >= 0.0f && data.bmeHumidity <= 100.0f));
    bool bmePresNan = isnan(data.bmePressure);
    assertTrue(bmePresNan || (data.bmePressure >= 300.0f && data.bmePressure <= 1100.0f));

    // Verify TSL2561 value
    bool tslLuxNan = isnan(data.tslLux);
    assertTrue(tslLuxNan || data.tslLux >= 0.0f);
}

test(SensorHelper_getMeanSensorData_returnsCorrectMean)
{
    // Arrange: Create array of 3 SensorData objects with known values
    SensorData dataList[3];

    dataList[0].timestamp = "2026-05-14T12:00:00Z";
    dataList[0].dhtHumidity = 40.0f;
    dataList[0].dhtTemperature = 20.0f;
    dataList[0].dhtHeatIndex = 20.0f;
    dataList[0].bmeHeatedUp = true;
    dataList[0].bmeTemperature = 20.0f;
    dataList[0].bmeHumidity = 30.0f;
    dataList[0].bmePressure = 1000.0f;
    dataList[0].bmeAltitude = 100.0f;
    dataList[0].bmeVOC = 10.0f;
    dataList[0].tslLux = 100.0f;

    dataList[1].timestamp = "2026-05-14T12:00:01Z";
    dataList[1].dhtHumidity = 50.0f;
    dataList[1].dhtTemperature = 22.0f;
    dataList[1].dhtHeatIndex = 23.0f;
    dataList[1].flameAnalog = 1500;
    dataList[1].flameDigital = true;
    dataList[1].thermistorAnalog = 3000;
    dataList[1].thermistorDigital = false;
    dataList[1].thermistorTemp = 25.0f;
    dataList[1].isOutlier = true;
    dataList[1].collectTraining = false;
    dataList[1].bmeHeatedUp = true;
    dataList[1].bmeTemperature = 22.0f;
    dataList[1].bmeHumidity = 40.0f;
    dataList[1].bmePressure = 1010.0f;
    dataList[1].bmeAltitude = 110.0f;
    dataList[1].bmeVOC = 20.0f;
    dataList[1].tslLux = 200.0f;

    dataList[2].timestamp = "2026-05-14T12:00:02Z"; // Newest
    dataList[2].dhtHumidity = 60.0f;
    dataList[2].dhtTemperature = 24.0f;
    dataList[2].dhtHeatIndex = 26.0f;
    dataList[2].flameAnalog = 2000;
    dataList[2].flameDigital = true;
    dataList[2].thermistorAnalog = 4000;
    dataList[2].thermistorDigital = false;
    dataList[2].thermistorTemp = 30.0f;
    dataList[2].isOutlier = true;
    dataList[2].collectTraining = true;
    dataList[2].bmeHeatedUp = true;
    dataList[2].bmeTemperature = 24.0f;
    dataList[2].bmeHumidity = 50.0f;
    dataList[2].bmePressure = 1020.0f;
    dataList[2].bmeAltitude = 120.0f;
    dataList[2].bmeVOC = 30.0f;
    dataList[2].tslLux = 300.0f;

    // Act: call method
    SensorData meanData = getMeanSensorData(dataList, 3);

    // Assert
    assertEqual(meanData.timestamp, String("2026-05-14T12:00:02Z")); // pick newest
    assertNear(meanData.dhtHumidity, 50.0f, 0.01f);
    assertNear(meanData.dhtTemperature, 22.0f, 0.01f);
    assertNear(meanData.dhtHeatIndex, 23.0f, 0.01f);
    assertEqual(meanData.flameAnalog, 1500);
    assertTrue(meanData.flameDigital); // 2 trues vs 1 false > majority
    assertEqual(meanData.thermistorAnalog, 3000);
    assertFalse(meanData.thermistorDigital); // 1 true vs 2 false < majority
    assertNear(meanData.thermistorTemp, 25.0f, 0.01f);
    assertTrue(meanData.isOutlier);       // 2 trues vs 1 false > majority
    assertTrue(meanData.collectTraining); // 2 trues vs 1 false > majority

    assertTrue(meanData.bmeHeatedUp);
    assertNear(meanData.bmeTemperature, 22.0f, 0.01f);
    assertNear(meanData.bmeHumidity, 40.0f, 0.01f);
    assertNear(meanData.bmePressure, 1010.0f, 0.01f);
    assertNear(meanData.bmeAltitude, 110.0f, 0.01f);
    assertNear(meanData.bmeVOC, 20.0f, 0.01f);
    assertNear(meanData.tslLux, 200.0f, 0.01f);
}

test(SensorHelper_readSensorsAveraged_delaysCorrectly)
{
    // Arrange: define counts and delays
    int n = 3;
    int t = 50;

    // Act: Measure execution time to verify the delay logic works
    unsigned long startTime = millis();
    SensorData data = readSensorsAveraged(n, t);
    unsigned long endTime = millis();

    // Assert: timing (should take at least (n-1)*t milliseconds)
    unsigned long expectedMinTime = (n - 1) * t;
    assertTrue((endTime - startTime) >= expectedMinTime);
}

test(SensorHelper_thermistorSteinhartHart_calculatesCorrectTemperature)
{
    // Arrange
    struct TestCase
    {
        int adcValue;
        float expectedTemperature;
        float tolerance;
    };

    TestCase testCases[] = {
        // ADC 4095 means R = 0, which maps to -273.15°C.
        {4095, -273.15f, 0.5f},

        // 10k NTC at 25°C (ADC 2048)
        {2048, 25.0f, 1.0f},

        // Lower resistance -> hotter
        {3300, 60.89f, 1.0f},

        // Higher resistance -> colder
        {800, -4.49f, 1.0f},

        // Near-open circuit, extremely cold
        {1, -97.86f, 5.0f},

        // Uses division-by-zero protection (falls back to ADC=1)
        {0, -97.86f, 5.0f}};

    for (const auto &testCase : testCases)
    {
        // Act
        float calculated = thermistorSteinhartHart(testCase.adcValue);

        // Debug-Output
        // Serial.printf("ADC: %d -> Calc: %.2f°C\n", testCase.adcValue, calculated);

        // Assert
        assertNear(testCase.expectedTemperature, calculated, testCase.tolerance);
    }
}