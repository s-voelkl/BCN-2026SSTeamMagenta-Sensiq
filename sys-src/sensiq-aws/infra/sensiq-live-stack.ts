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

    const liveTable = new dynamodb.Table(this,'LiveDataDB',{
      tableName: 'SensiqLiveState',
      partitionKey:{
        name:'device_id',
        type:dynamodb.AttributeType.STRING,
      },

      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity:1,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    } );

    
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