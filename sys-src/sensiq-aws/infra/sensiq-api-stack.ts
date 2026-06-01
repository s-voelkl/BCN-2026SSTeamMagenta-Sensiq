import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import path from 'path';

export class SensiqApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const liveFunction = new PythonFunction(this, 'HandleLiveData', {
      entry: path.join(__dirname, '..', 'src', 'lambda', 'live'),
      index: 'handle_live_data.py',
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(10),
    });

    const historyFunction = new PythonFunction(this, 'HandleHistoryDataApi', {
      entry: path.join(__dirname, '..', 'src', 'lambda', 'history'),
      index: 'handle_history_data.py',
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_12,
      timeout: cdk.Duration.seconds(30),
    });

    const api = new apigateway.RestApi(this, 'SensiqRestApi', {
      restApiName: 'sensiq-api',
      description: 'REST API for Sensiq live and historical sensor data.',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
      },
    });

    const live = api.root.addResource('live');
    live.addMethod('GET', new apigateway.LambdaIntegration(liveFunction));

    const history = api.root.addResource('history');
    history.addMethod('GET', new apigateway.LambdaIntegration(historyFunction));

    new cdk.CfnOutput(this, 'SensiqApiUrl', {
      value: api.url,
    });
  }
}
