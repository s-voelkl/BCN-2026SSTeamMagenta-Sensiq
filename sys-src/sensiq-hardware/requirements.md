# Requirements for running the Sensiq Hardware

## Hardware

- ESP32
- Breadboard and Jumper Wires
- USB to Micro USB Cable for Programming
- DHT11 Temperature and Humidity Sensor
- KY-026 Flame Sensor
- KY-028 Thermistor Sensor
- BME680 Volatile Organic Compound (VOC) Sensor
- TSL2561 Light Sensor

### Pin Assignments

- DHT11: Digital Pin 4
- KY-026 Flame Sensor: Analog Pin 34 (analog output), Digital Pin 35 (digital output)
- KY-028 Thermistor Sensor: Analog Pin 32 (analog output), Digital Pin 33 (digital output)
- Button for Outlier Marking: Digital Pin 25
- Button for Training Data Collection: Digital Pin 26

## Arduino Libraries

- ArduinoHttpClient (Arduino)
- MQTT (Joel Gaehwiler)
- ArduinoJson (Benoit Blanchon)
- WiFi (Arduino)
- DHT sensor library (Adafruit)
- AUnit (Brian T. Park)

## Arduino Boards Manager

- Esp32 (Espressif Systems) with newest Version 3.3.8 or higher
