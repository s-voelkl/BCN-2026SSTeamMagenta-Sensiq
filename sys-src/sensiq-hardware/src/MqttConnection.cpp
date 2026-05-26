#include "MqttConnection.h"
#include "config.h"
#include <MQTT.h>
#include <WiFiClientSecure.h>

MQTTClient mqttClient(1024);
WiFiClientSecure secureClient;

String fullTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_data);
String testTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_test);

/**
 * @brief Callback function for handling incoming MQTT messages.
 * This function is triggered whenever a message is received on a subscribed topic.
 *
 * @param topic The topic the message was received on.
 * @param payload The message payload.
 */
void messageReceived(String &topic, String &payload)
{
    Serial.println("MQTT Message received on topic " + topic + " with payload length " + String(payload.length()));
}

/**
 * @brief Setup the MQTT client.
 * Configures the MQTT server and port based on the credentials in config.h.
 *
 * @note This function should be called once during the setup phase of the MCU to
 * initialize the MQTT client with the correct server settings and authentication credentials.
 */
void setupMQTT()
{
    Serial.println("Setting up Secure MQTT client: " + String(mqtt_server_hostname) + ":" + String(mqtt_server_port));

    // Configure TLS certificates for secure connection to AWS IoT Core.
    // Exact time required for TLS certificate validation, as certificates have a validity period.
    secureClient.setCACert(mqtt_aws_root_ca_cert);
    secureClient.setCertificate(mqtt_aws_device_cert);
    secureClient.setPrivateKey(mqtt_aws_private_key);

    // Larger timeout needed for 
    secureClient.setTimeout(10);

    // server settings
    mqttClient.begin(mqtt_server_hostname, mqtt_server_port, secureClient);
    mqttClient.onMessage(messageReceived);
}

/**
 * @brief Connects or reconnects to the MQTT broker.
 * This function handles connecting to the server asynchronously using the configured credentials.
 */
void connectToMQTT()
{
    if (!mqttClient.connected())
    {
        Serial.print("Connecting to MQTT server: ");
        Serial.print(mqtt_server_hostname);
        Serial.println("...");

        // Attempt to connect
        if (mqttClient.connect(device_id, mqtt_username, mqtt_password)) {
            Serial.println("MQTT connected successfully!");

            // Set subscription for real usage.
            mqttClient.subscribe(fullTopic, mqtt_qos);
            Serial.println("Subscribed at QoS " + String(mqtt_qos) + ", topic: " + fullTopic);

            // Test subscription to verify connection with test topic.
            mqttClient.subscribe(testTopic, mqtt_qos);
            Serial.println("Subscribed at QoS " + String(mqtt_qos) + ", topic: " + testTopic);

            // Test publish to verify connection with test topic.
            String testPayload = "Test message from " + String(device_id);
            mqttClient.publish(testTopic, testPayload, false, mqtt_qos);
            Serial.println("Published to topic: " + testTopic);
        } else {
            Serial.println("MQTT connection failed. Retrying later.");
        }
    }
}

/**
 * @brief Handles background MQTT tasks.
 * Should be called in the main loop to process incoming messages and keep the connection alive.
 */
void loopMQTT()
{
    mqttClient.loop();
}

/**
 * @brief Publishes data to the configured MQTT topic and subtopic.
 * The full topic is constructed using the base mqtt_topic, device_id, and mqtt_subtopic_data.
 *
 * @param payload The string payload to publish.
 * @return true if published successfully, false otherwise.
 */
bool publishMQTTData(const String &payload)
{
    Serial.println("Publishing to topic [" + String(fullTopic) + "]: " + String(payload));

    if (mqttClient.connected())
    {
        // publish(topic, payload, retained, qos)
        bool success = mqttClient.publish(fullTopic, payload, false, mqtt_qos);
        if (success)
        {
            Serial.println("MQTT Publish: Success.");
            return true;
        }
        else
        {
            Serial.println("MQTT Publish: Failed.");
            return false;
        }
    }
    else
    {
        Serial.println("MQTT Publish: Failed (not connected).");
        return false;
    }
}