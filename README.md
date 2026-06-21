# BCN-2026SSTeamMagenta-Sensiq

Sensiq: Serverless IoT Environmental Monitoring

Sensiq is an end-to-end microcontroller-based Internet of Things (IoT) architecture designed to monitor critical indoor environment quality (IEQ) parameters such as temperature, humidity, light intensity, gas concentration, and flame exposure in real time.

By combining inexpensive ESP32 sensor edge devices with a serverless Amazon Web Services (AWS) cloud backend, Sensiq delivers reliable, low-latency live monitoring alongside cost-efficient historical analytics.

**Key Features:**

- **Edge Node:** ESP32-based multi-sensor array transmitting data via TLS-secured MQTT.
- **Serverless Cloud:** AWS backend for data validation, long-term persistence, and REST API exposure.
- **Web Frontend:** React-based dashboard for visualizing live and historical data without vendor lock-in.
- **Alerting:** Threshold-driven email notifications for critical, safety-relevant events.

## Usage

For usage instructions, please refer to the [usage.md file](USAGE.md) in the root directory of this repository.

## License

The source files are licensed under the MIT License; the documentation is licensed under the Creative Commons Attribution 4.0 International License.

## Code Coverage

The hardware code coverage results can be obtained from ``sys-src/sensiq-hardware/test_output.md``.

The AWS code coverage can be splitted into Python lambda handlers and the AWS infrastructure code.
The Python code coverage results can be obtained from ``sys-src/sensiq-aws/coverage/pytest-lambda-coverage.md``; the Typescript code coverage results using Jest can be found in the ``sys-src/sensiq-aws/coverage/jest-aws-coverage`` directory.

Frontend code coverage results can be found in the ``sys-src/sensiq-frontend/coverage`` directory.

## Hardware Unit

Assembled hardware unit with all sensors and components:
![Assembled hardware unit with all sensors and components](sys-doc/techrep/src/hardware-picture.png)

Logical architecture of the hardware unit, see [circuit diagram](sys-doc\kicad-hardware-schematic\circuit_diagram_pdf\circuit_diagram_export_light.pdf).

## AWS Cloud Backend

AWS [architecture diagram](sys-doc/techrep/src/architecture_diagram.pdf).

## React Frontend

Example of the React [frontend dashboard](sys-doc/techrep/src/frontend.pdf).

## Alerting System

An example of an email alert triggered by the [alerting system](sys-doc/techrep/src/email-alert.txt).

## Authors and acknowledgment

Authors of this repository are Simon Völkl ([s.voelkl2@oth-aw.de](mailto:s.voelkl2@oth-aw.de)), Johannes Schieder ([j.schieder@oth-aw.de](mailto:j.schieder@oth-aw.de)), Sebastian Rosner ([s.rosner@oth-aw.de](mailto:s.rosner@oth-aw.de)), and Andre Tien Vu ([a.vu@oth-aw.de](mailto:a.vu@oth-aw.de)). We would like to thank our professor Dr.-Ing. Christoph Neumann for his support and guidance throughout the project.

Support available for this project is limited. Please feel free to reach out to us via email.
