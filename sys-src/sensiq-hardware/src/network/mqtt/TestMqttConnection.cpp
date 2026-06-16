#include "../../config.h"

#include <ArduinoJson.h>
#include "MqttConnection.h"
#include <MQTT.h>
#include <AUnit.h>

extern String fullTopic;
extern String testTopic;
extern MQTTClient mqttClient;

test(MqttConnection_TopicsConstructedCorrectly)
{
    // Arrange:
    String expectedFullTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_data);
    String expectedTestTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_test);

    // Assert:
    assertEqual(fullTopic, expectedFullTopic);
    assertEqual(testTopic, expectedTestTopic);
}

test(MqttConnection_PublishFailsWhenDisconnected)
{
    // Arrange: ensure client is disconnected
    // Act
    bool result = publishMQTTData("test_payload");

    // Assert
    assertFalse(result);
}
