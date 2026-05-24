import * as cdk from 'aws-cdk-lib';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class IotCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // for test purposes only -> will be removed later (replaced by an actual service like lambda or kinesis firehose)
    const debugLogGroup = new logs.LogGroup(this, 'IotDebugLogs', {
      logGroupName: '/iot/esp32/all_messages',
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // for testing only -> will be removed later
    const alertLogGroup = new logs.LogGroup(this, 'IotAlertLogs', {
      logGroupName: '/iot/esp32/alerts',
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });


    // replace cloudwatch logs with actual processing service
    new iot.TopicRule(this, 'LiveRule', {
      sql: iot.IotSql.fromStringAsVer20160323("SELECT * FROM 'sensiq/+/data'"),
      actions: [new actions.CloudWatchLogsAction(debugLogGroup)],
    });

    // for test purposes only -> will be removed later
    new iot.TopicRule(this, 'TestTempRule', {
      sql: iot.IotSql.fromStringAsVer20160323(
        "SELECT temperature FROM 'sensiq/+/data'"
      ),
      actions: [new actions.CloudWatchLogsAction(alertLogGroup)],
    });
  }
}