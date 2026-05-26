#include <AUnit.h>
#include "config.h"
#include <ArduinoJson.h>

extern String fullTopic;
extern String testTopic;

test(MqttConnection_TopicsConstructedCorrectly)
{
    // Arrange: 
    String expectedFullTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_data);
    String expectedTestTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_test);

    // Assert:
    assertEqual(fullTopic, expectedFullTopic);
    assertEqual(testTopic, expectedTestTopic);
}
