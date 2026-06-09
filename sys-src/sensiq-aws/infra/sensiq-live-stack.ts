import * as cdk from 'aws-cdk-lib';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import path from 'path';



export class SensiqLiveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    
// Creates a DynamoDB table ('LiveDataDB') for ESP32 sensor data.
// Partition Key: 'device_id' (String) to identify each device.
// Billing: Provisioned with minimal capacity (1 read / 1 write) 
// Removal Policy: DESTROY (table and data are deleted on stack teardown)


    const liveTable = new dynamodb.Table(this,'LiveDataDB',{
      tableName: 'LiveDataDB',
      partitionKey:{
        name:'device_id',
        type:dynamodb.AttributeType.STRING,
      },

      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity:1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    } );

    // Creates a Python-based Lambda function for data validation.
    // Runtime & Timeout: Uses Python 3.12 with a 15-second execution timeout.
    // The code reads the database name from the environment to dynamically connect and save the sensor data to the correct DynamoDB table.

    const lambdaHandleValidation = new PythonFunction(this, 'HandleValidation', {
        entry: path.join(__dirname, '..', 'src', 'lambda', 'validation'), // points to the directory containing the lambda function code
        index: 'handle_validation.py', // the file containing the lambda handler
        handler: 'handler',
        runtime: lambda.Runtime.PYTHON_3_12,
        timeout: cdk.Duration.seconds(15),
        environment: {
        TABLE_NAME: liveTable.tableName
        }}
    );

    liveTable.grantReadWriteData(lambdaHandleValidation);

    
    new iot.TopicRule(this, 'LiveRule', {
      sql: iot.IotSql.fromStringAsVer20160323("SELECT * FROM 'sensiq/+/data'"),
      actions: [ new actions.LambdaFunctionAction(lambdaHandleValidation) ],
    });

      // Function to return live data
      // Runtime & Timeout: Uses Python 3.12 with a 15-second execution timeout.
      //This code retrieves the latest data for a specific device from the DynamoDB table and checks if the device is offline by verifying if its last timestamp is older than 6 minutes.
       const lambdaHandleLiveData = new PythonFunction(this, 'HandleLiveData', {
      entry: path.join(__dirname, '..', 'src', 'lambda', 'live'),
      index: 'handle_live_data.py',
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(15),
      environment: {
        TABLE_NAME: liveTable.tableName  
      }
    });

    liveTable.grantReadData(lambdaHandleLiveData);

  }
}