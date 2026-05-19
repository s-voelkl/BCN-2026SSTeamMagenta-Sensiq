// required for enabling SSL/TLS support in AsyncMqttClient, before including the library header
#define ASYNC_TCP_SSL_ENABLED 1

#include "MqttConnection.h"
#include "config.h"
#include <AsyncMqtt_Generic.h>
#include <WiFiClientSecure.h>

AsyncMqttClient mqttClient;
WiFiClientSecure secureClient;

String fullTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_data);
String testTopic = String(mqtt_topic) + "/" + String(device_id) + "/" + String(mqtt_subtopic_test);

/**
 * @brief Callback function for successful MQTT connection, verifies connection.
 * This function is called when the MQTT client successfully connects to the broker.
 * It performs a test subscription and a test publish to verify that the connection is working correctly.
 */
void onMqttConnect(bool sessionPresent)
{
    Serial.println("MQTT connected successfully!");

    // Set subscription for real usage.
    uint16_t packetIdSub = mqttClient.subscribe(fullTopic.c_str(), 1);
    Serial.println("Subscribed at QoS 1, packetId: " + String(packetIdSub) + ", topic: " + fullTopic);

    // Test subscription to verify connection with test topic and qos 1.
    packetIdSub = mqttClient.subscribe(testTopic.c_str(), 1);
    Serial.println("Subscribed at QoS 1, packetId: " + String(packetIdSub) + ", topic: " + testTopic);

    // Test publish to verify connection with test topic and qos 1.
    String testPayload = "Test message from " + String(device_id);
    uint16_t packetIdPub = mqttClient.publish(testTopic.c_str(), 1, false, testPayload.c_str());
    Serial.println("Published at QoS 1, packetId: " + String(packetIdPub) + ", topic: " + testTopic);
}

/**
 * @brief Callback function for MQTT disconnection.
 */
void onMqttDisconnect(AsyncMqttClientDisconnectReason reason)
{
    Serial.println("MQTT disconnected.");
}

/**
 * @brief Callback function for handling incoming MQTT messages.
 * This function is triggered whenever a message is received on a subscribed topic.
 *
 * @param topic The topic the message was received on.
 * @param payload The message payload.
 * @param properties MQTT message properties.
 * @param len The length of the payload.
 * @param index The index of the current payload chunk.
 * @param total The total size of the payload.
 */
void onMqttMessage(char *topic, char *payload, const AsyncMqttClientMessageProperties &properties,
                   const size_t &len, const size_t &index, const size_t &total)
{
    Serial.println("MQTT Message received on topic " + String(topic) + " with payload length " + String(len));
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
    Serial.print("Setting up Secure MQTT client: " + String(mqtt_server_hostname) + ":" + String(mqtt_server_port));

    // Set root certificate. Exact time required for TLS certificate validation, as certificates have a validity period.
    secureClient.setCACert(mqtt_root_ca_cert);
    // TODO: For production, replace this with the actual CA certificate of the MQTT broker for secure TLS connection.
    // secureClient.setInsecure();

    // callback functions
    mqttClient.onConnect(onMqttConnect);
    mqttClient.onDisconnect(onMqttDisconnect);
    mqttClient.onMessage(onMqttMessage);

    // server settings
    mqttClient.setServer(mqtt_server_hostname, mqtt_server_port);
    mqttClient.setCredentials(mqtt_username, mqtt_password);

    // keep alive interval in seconds
    mqttClient.setKeepAlive(60);

    // sometimes explicit secure flag is required for some versions of AsyncMQTT
    mqttClient.setSecure(true);
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

        // Attempt to connect (non-blocking)
        mqttClient.connect();
    }
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
        // topic, qos, retain (not saved by broker for later subscribers), payload
        uint16_t packetIdPub = mqttClient.publish(fullTopic.c_str(), mqtt_qos, false, payload.c_str());
        // success if packetIdPub > 0, failure if 0
        if (packetIdPub > 0)
        {
            Serial.println("MQTT Publish: Success.");
            return true;
        }
        else
        {
            Serial.println("MQTT Publish: Failed (Packed ID 0).");
            return false;
        }
    }
    else
    {
        Serial.println("MQTT Publish: Failed (not connected).");
        return false;
    }
}