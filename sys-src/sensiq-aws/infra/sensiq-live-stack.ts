import * as cdk from 'aws-cdk-lib';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import path from 'path';

/**
 * Stack for the live data processing of Sensiq.
 */
export class SensiqLiveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SNS topic for alerts
    const alertTopic = new sns.Topic(this, 'SensiqAlertTopic', {
      topicName: 'sensiq-alerts',
      displayName: 'Sensiq Alerts',
    });

    // Stores the latest email timestamp per device and alert reason.
    // This prevents repeated emails while a sensor value stays critical.
    const sentEmailsTable = new dynamodb.Table(this, 'SensiqSentEmailsTable', {
      tableName: 'sensiq-email-list-sent-mails',
      partitionKey: {
        name: 'device_id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'reason',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // relatively low traffic and unpredictable
      removalPolicy: cdk.RemovalPolicy.DESTROY, // no long term data retention needed 
    });

    const alertEmail = this.node.tryGetContext('alertEmail') as string | undefined;

    // Try to get the alert email from context, else log a warning.
    if (alertEmail) {
      alertTopic.addSubscription(
        new subscriptions.EmailSubscription(alertEmail)
      );
    } else {
      new cdk.CfnOutput(this, 'AlertEmailOutput', {
        value: 'No alert email configured. Set the "alertEmail" context variable to receive alerts.',
      });
    }

    // lambda function for validation of incoming data an dynamo imputation
    // Creates a DynamoDB table for live sensor data
    // read/write only newest sample, so keep minimal capacity
    // provisioned billing mode as the traffic is predictable and low, with 1 read and 1 write capacity unit.
    // destroy on cdk removal as no long term data retention is needed
    const liveTable = new dynamodb.Table(this, 'LiveDataDB', {
      tableName: 'LiveDataDB',
      partitionKey: {
        name: 'device_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Creates a Python-based Lambda function for data validation.
    // The code reads the database name from the environment to dynamically
    // connect and save the sensor data to the correct DynamoDB table.
    const lambdaHandleValidation = new PythonFunction(this, 'HandleValidation', {
      entry: path.join(__dirname, '..', 'src', 'lambda', 'validation'), // points to the directory containing the lambda function code
      index: 'handle_validation.py', // the file containing the lambda handler
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(29),
      environment: {
        TABLE_NAME: liveTable.tableName,
        ALERT_TOPIC_ARN: alertTopic.topicArn,
        SENT_EMAILS_TABLE_NAME: sentEmailsTable.tableName,
      }
    }
    );

    // permissions for the lambda function
    alertTopic.grants.publish(lambdaHandleValidation);
    sentEmailsTable.grantReadWriteData(lambdaHandleValidation);

    // IoT rule to trigger the lambda function on incoming data
    liveTable.grantReadWriteData(lambdaHandleValidation);

    // When new data is published to the 'sensiq/+/data' topic, the IoT Topic Rule triggers
    // the Lambda function to validate and process the incoming sensor data before saving it to the DynamoDB table.
    new iot.TopicRule(this, 'LiveRule', {
      sql: iot.IotSql.fromStringAsVer20160323("SELECT * FROM 'sensiq/+/data'"),
      actions: [new actions.LambdaFunctionAction(lambdaHandleValidation)],
    });

    // Function to return live data
    // This code retrieves the latest data for a specific device from the DynamoDB table and
    // checks if the device is offline.
    // timeout: aligned with API Gateway max timeout to accommodate Athena cold starts, see history stack.
    const lambdaHandleLiveData = new PythonFunction(this, 'HandleLiveData', {
      entry: path.join(__dirname, '..', 'src', 'lambda', 'live'),
      index: 'handle_live_data.py',
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(29),
      environment: {
        TABLE_NAME: liveTable.tableName
      }
    });

    liveTable.grantReadData(lambdaHandleLiveData);
  }
}
