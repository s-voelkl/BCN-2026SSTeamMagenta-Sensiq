import * as cdk from 'aws-cdk-lib';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import path from 'path';



export class IotCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // lambda function for validation of incoming data an dynamo imputation
    const lambdaHandleValidation = new PythonFunction(this, 'HandleValidation', {
        entry: path.join(__dirname, '..', 'src', 'lambda', 'validation'), // points to the directory containing the lambda function code
        index: 'handle_validation.py', // the file containing the lambda handler
        handler: 'handler',
        runtime: lambda.Runtime.PYTHON_3_12,
        timeout: cdk.Duration.seconds(15),
        environment: {}}
    );

    // for validation lambda trigger
    new iot.TopicRule(this, 'LiveRule', {
      sql: iot.IotSql.fromStringAsVer20160323("SELECT * FROM 'sensiq/+/data'"),
      actions: [ new actions.LambdaFunctionAction(lambdaHandleValidation) ],
    });

  }
}