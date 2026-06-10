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
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
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
        SENT_EMAILS_TABLE_NAME: sentEmailsTable.tableName,
      }
    }
    );

    // permissions for the lambda function
    alertTopic.grants.publish(lambdaHandleValidation);
      sentEmailsTable.grantReadWriteData(lambdaHandleValidation);

    // IoT rule to trigger the lambda function on incoming data
    new iot.TopicRule(this, 'LiveRule', {
      sql: iot.IotSql.fromStringAsVer20160323("SELECT * FROM 'sensiq/+/data'"),
      actions: [new actions.LambdaFunctionAction(lambdaHandleValidation)],
    });

  }
}
