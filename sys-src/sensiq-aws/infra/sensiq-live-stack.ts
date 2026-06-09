import * as cdk from 'aws-cdk-lib';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import path from 'path';


/**
 * SensiQLiveStack defines the AWS infrastructure for handling live sensor data from ESP32 devices.
 * It includes:
 * - A DynamoDB table ('LiveDataDB') to store incoming sensor data.
 * - A Python-based Lambda function for validating and processing the sensor data before saving it to the database.
 * - An IoT Topic Rule that triggers the Lambda function whenever new data is published to the 'sensiq/+/data' topic.
 * - Another Python-based Lambda function to retrieve live data for a specific device and check if it's offline based on the last timestamp.
 */
export class SensiqLiveStack extends cdk.Stack {
    // Exposed so the API Gateway stack can route GET /live to this existing
    // Lambda instead of creating a second live-data Lambda without DynamoDB permissions.
    public readonly lambdaHandleLiveData: lambda.IFunction;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
      entry: path.join(__dirname, '..', 'src', 'lambda', 'validation'), // directory
      index: 'handle_validation.py', // file
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(29),
      environment: {
        TABLE_NAME: liveTable.tableName
      }
    }
    );

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
    this.lambdaHandleLiveData = new PythonFunction(this, 'HandleLiveData', {
      entry: path.join(__dirname, '..', 'src', 'lambda', 'live'),
      index: 'handle_live_data.py',
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(29),
      environment: {
        TABLE_NAME: liveTable.tableName
      }
    });

    liveTable.grantReadData(this.lambdaHandleLiveData);
  }
}
