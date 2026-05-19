# MCU Setup with Sensors

## Verkabelung

### MCU und Breadboard

Ground: Minus, schwarz
VCC mit 3.3V, plus, rot
Spannungsgebung durch PC-Kabel mit USB zu Micro-USB

Pinout: https://blog.berrybase.de/esp32-node-mcu-module-anfaenger-guide/

### ASAIR DHT11 Temperatur- und Feuchtigkeitssensor

Verkabelungsinfo: https://www.circuitbasics.com/how-to-set-up-the-dht11-humidity-sensor-on-an-arduino/, https://asairsensors.com/product/dht11-sensor/
Power: 3,3V bis 5,5V mit 1000uA when measuring and 60uA when sleeping
Repeatability: ±1% relative humidity and ±1°C temperature
Accuracy: ±5% relative humidity and ±2°C temperature
Measuring range: 5-98% RH, -20-60°C
Sampling rate: 0.5Hz (2s)

Code example: https://docs.arduino.cc/libraries/dht-sensor-library/, https://www.roboter-bausatz.de/projekte/dht11-temperatur-sensor-per-arduino-auslesen

### Joy-it KY-026 analoger Flammensensor

https://sensorkit.joy-it.net/de/sensors/ky-026

Digitaler Ausgang: Werden Flammen erkannt, so wird hier ein Signal ausgegeben. Per Potentiometer Schwellenwert einstellbar.
Analoger Ausgang: Direkter Messwert der Sensoreinheit. Invertiert, also bei keiner Flamme hoher Wert.
LED1: Zeigt an, dass der Sensor mit Spannung versorgt ist.
LED2: Zeigt an, dass Flammen detektiert wurden.
Misst Flammen durch das IR-Spektrum von 760nm bi 1100nm.
Detection Distance: Up to ~100cm (depends on flame size).
Sensor Detection Angle 60°. (https://arduinomodules.info/ky-026-flame-sensor-module/)

Operating voltage 3.3 V - 5 V

Kein extra ADC notwendig, da ESP32 bereits hochauflösende ADCs besitzt. https://www.berrybase.de/en/esp32-nodemcu-development-board
Usage: https://draeger-it.blog/esp32-flammensensor-dual-color-led/

### Joy-it KY-028 Thermistor

https://sensorkit.joy-it.net/de/sensors/ky-028

Digitaler Ausgang: Wird der Schwellwert überschritten, so wird hier ein Signal ausgegeben. Per Potentiometer Schwellenwert einstellbar.
Analoger Ausgang: Direkter Messwert der Sensoreinheit. Invertiert, also bei keiner Hitze hoher Wert.
LED1: Zeigt an, dass der Sensor mit Spannung versorgt ist.
LED2: Zeigt an, dass der Temperaturschwellenwert überschritten wurde.

It measures from -55°C to 125°C with ±0.5°C accuracy. (https://arduinomodules.info/ky-028-digital-temperature-sensor-module/)
https://nafcom.es/fotos_pdt/108.MD9197/108.MD9197_FICHA.pdf

Conversion von ADC Wert zu Temperatur: https://en.wikipedia.org/wiki/Steinhart%E2%80%93Hart_equation


Operating voltage 3.3 V - 5 V

## Unit Testing

Mit AUnit - Implementierung so, dass entweder die Tests oder die Hauptfunktionalität ausgeführt werden kann, aber nicht beides gleichzeitig.
[AUnit Dokumentation](https://github.com/bxparks/AUnit).

Es existieren Tests für SensorHelper und WifiConnection. Für MQTT ist es ohne komplettes Mocking nicht wirklich umsetzbar,
praktische Unit-Tests zu schreiben. Das Mocking wäre nicht mehr zielführend, da es weit ab der realen Funktionen läge.
Da die MQTT-Funktionalität aber gut dokumentiert und von der Community in etlichen Beispielen getestet wurde, und etabliert ist,
wurde sich hier gegen eine komplexe Testimplementierung entschieden.
Ein direktes Feedback wurde jedoch implementiert: Nach einem erfolgreichen Verbindungsaufbau zum MQTT-Broker
wird einerseits ein Subscribe auf die Daten-Topic durchgeführt, um die Verbindung stetig zu verifizieren.
Anderseits wird ein Test-Payload auf eine Test-Topic gepublished, um direkt die Publish-Funktionalität zu verifizieren.

## Funktionalität

setup:
Zu Beginn des Programms werden die Sensor-Pins festgelegt, die Sensoren initialisiert,
die aktuelle Uhrzeit mit einem NTP-Server synchronisiert, eine WiFi-Verbindung aufgebaut
und eine Verbindung zum MQTT-Broker hergestellt.
Die Credentials für WiFi und MQTT werden in einer separaten Datei `credentials.h` gespeichert,
die nicht in das Repository aufgenommen wird, um sensible Informationen zu schützen.

loop:
Jede Sekunde werden die Werte des Sensoren durch den ESP32 gelesen und als struct gespeichert.
Alle 5 Werte werden gemittelt, um Rauschen zu reduzieren.
Die gemittelten Werte werden in ein JSON-Format umgewandelt und per WiFi und MQTT an einen Broker für die weitere Verarbeitung gesendet.

## MQTT

Verwendung von Async MQTT für asynchrone Kommunikation, um die Hauptschleife nicht zu blockieren.

Vorteile: (https://github.com/khoih-prog/AsyncMQTT_Generic#why-async-is-better)

- schneller
- blockiert nicht die Hauptschleife
- Hintergrundausführung während Warten auf die Serverantwort möglich
- bessere Performance bei instabilen Verbindungen

Zertifikate: Sicherung der Verbingung mit TLS-Zertifikaten, um die Datenübertragung zu schützen. Zusätzlich Authentifizierung mit Benutzername und Passwort, um unbefugten Zugriff zu verhindern.

## Sensoren

Analoge Werte von KY-026 und KY-028 werden invertiert, um die Lesbarkeit zu verbessern (höherer Wert = höhere Flamme/Hitze).
Die Anzahl der möglichen Sensorwerte ist dabei durch die Auflösung des ADCs begrenzt.
Beim ESP32 haben die ADCs eine Auflösung von 12 Bit, was bedeutet, dass die Werte zwischen 0 und 4095 liegen.

Für die Umrechnung des analogen Temperaturwerts des KY-028 in Grad Celsius wird die Steinhart-Hart-Gleichung verwendet.
Dabei kann keine lineare Skalierung vorgenommen werden, da die Beziehung zwischen Widerstand und Temperatur bei einem Thermistor nicht linear ist.
Die Steinhart-Hart-Gleichung nutzt halbleiterabhängige Koeffizienten A, B und C, um die Umrechnung durchzuführen.
(siehe Funktion `thermistorSteinhartHart` in SensorHelper.cpp)
Der KY-028 verwendet einen kalibrierbaren Widerstand als Potentiometer, der vor der Benutzung eingestellt werden muss.
Mittels Drehung an dem Potentiometer und Vergleich mit dem Referenzthermometer bzw. DHT11 bei Raumtemperatur,
kann der Widerstand passend eingestellt werden, sodass der Themperaturmesswert des KY-028 bei Raumtemperatur
mit dem des Referenzthermometers übereinstimmt. Dadurch wird die Genauigkeit der Temperaturmessung sichergestellt.

Beim KY-026 kann das Potentiometer so eingestellt werden, dass bei einer bestimmten analogen Größe
der digitale Wert von LOW auf HIGH wechselt und damit der Schwellwert für die Flammenerkennung definiert wird.

Der DHT11 liefert bereits direkt die kalibrierten Werte für Temperatur und Feuchtigkeit,
sodass hier keine weitere Umrechnung notwendig ist.
Allerdings weist der DHT11 eine kleinere mögliche Temperaturspanne und höherere Messungenauigkeit auf als der KY-028 auf.
