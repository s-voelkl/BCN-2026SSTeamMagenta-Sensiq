#include <AUnit.h>
#include "config.h"

test(Config_valuesExistAndAreCorrect)
{
    // Assert: WiFi credentials
    assertNotEqual(static_cast<int>(String(wifi_ssid).length()), 0);
    assertNotEqual(static_cast<int>(String(wifi_password).length()), 0);

    // device information
    assertNotEqual(static_cast<int>(String(device_id).length()), 0);
    assertNotEqual(static_cast<int>(String(device_location).length()), 0);

    // MQTT server configuration
    assertNotEqual(static_cast<int>(String(mqtt_server_hostname).length()), 0);
    assertTrue(mqtt_server_port > 0);
    assertNotEqual(static_cast<int>(String(mqtt_topic).length()), 0);
    assertNotEqual(static_cast<int>(String(mqtt_subtopic_data).length()), 0);
    assertNotEqual(static_cast<int>(String(mqtt_subtopic_test).length()), 0);
    assertNotEqual(static_cast<int>(String(mqtt_username).length()), 0);
    assertNotEqual(static_cast<int>(String(mqtt_password).length()), 0);
    assertTrue(mqtt_qos >= 0 && mqtt_qos <= 2);

    // mqtt certificates
    assertNotEqual(static_cast<int>(String(mqtt_root_ca_cert).length()), 0);
}