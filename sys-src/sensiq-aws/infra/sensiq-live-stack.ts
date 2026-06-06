import * as cdk from 'aws-cdk-lib';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import path from 'path';



export class SensiqLiveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      const alertTopic = new sns.Topic(this, 'SensiqAlertTopic', {
          topicName: 'sensiq-alerts',
          displayName: 'Sensiq Alerts',
      });

      const alertEmail = this.node.tryGetContext('alertEmail') as string | undefined;

      if (alertEmail) {
          alertTopic.addSubscription(
              new subscriptions.EmailSubscription(alertEmail)
          );
      }

    // lambda function for validation of incoming data an dynamo imputation
    const lambdaHandleValidation = new PythonFunction(this, 'HandleValidation', {
        entry: path.join(__dirname, '..', 'src', 'lambda', 'validation'), // points to the directory containing the lambda function code
        index: 'handle_validation.py', // the file containing the lambda handler
        handler: 'handler',
        runtime: lambda.Runtime.PYTHON_3_12,
        timeout: cdk.Duration.seconds(15),
        environment: {
            ALERT_TOPIC_ARN: alertTopic.topicArn,
        }}
    );

    alertTopic.grantPublish(lambdaHandleValidation);

    // for validation lambda trigger
    new iot.TopicRule(this, 'LiveRule', {
      sql: iot.IotSql.fromStringAsVer20160323("SELECT * FROM 'sensiq/+/data'"),
      actions: [ new actions.LambdaFunctionAction(lambdaHandleValidation) ],
    });

  }
}
