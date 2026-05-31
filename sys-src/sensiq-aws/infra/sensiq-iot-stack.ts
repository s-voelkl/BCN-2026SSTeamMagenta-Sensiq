import * as cdk from 'aws-cdk-lib';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Construct } from 'constructs';
import path from 'path';
import { SensiqAthenaStack } from './sensiq-athena-stack';

interface IotCoreStackProps extends cdk.StackProps {
  athenaStack: SensiqAthenaStack;
}

export class IotCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: IotCoreStackProps) {
    super(scope, id, props);

    const {athenaStack} = props!; // non-null assertion, since we require this prop

        const firehoseRole = new iam.Role(this, 'FirehoseRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
    });

    athenaStack.dataBucket.grantReadWrite(firehoseRole);

    // Glue permissions so Firehose can use the schema for Parquet conversion
    firehoseRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'glue:GetTable',
        'glue:GetTableVersion',
        'glue:GetTableVersions',
      ],
      resources: [
        cdk.Arn.format({ service: 'glue', resource: 'catalog' }, this),
        cdk.Arn.format({ service: 'glue', resource: 'database', resourceName: 'sensiq_history_db' }, this),
        cdk.Arn.format({ service: 'glue', resource: 'table', resourceName: 'sensiq_history_db/sensor_data' }, this),
      ],
    }));

    // --- Firehose Delivery Stream ---
    const firehoseStream = new firehose.CfnDeliveryStream(this, 'SensiqHistoryFirehose', {
      deliveryStreamType: 'DirectPut',
      extendedS3DestinationConfiguration: {
        bucketArn: athenaStack.dataBucket.bucketArn,
        roleArn: firehoseRole.roleArn,
        prefix: 'data/year=!{partitionKeyFromQuery:year}/month=!{partitionKeyFromQuery:month}/day=!{partitionKeyFromQuery:day}/',
        errorOutputPrefix: 'errors/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/',

        // Dynamic partitioning — extracts year/month/day from the timestamp field
        dynamicPartitioningConfiguration: {
          enabled: true,
        },
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: 'MetadataExtraction',
              parameters: [
                {
                  parameterName: 'MetadataExtractionQuery',
                  // Extracts partition keys from the IoT message timestamp field
                  parameterValue: '{year: .timestamp[0:4], month: .timestamp[5:7], day: .timestamp[8:10]}',
                },
                {
                  parameterName: 'JsonParsingEngine',
                  parameterValue: 'JQ-1.6',
                },
              ],
            },
          ],
        },

        // Parquet conversion via Glue schema
        dataFormatConversionConfiguration: {
          enabled: true,
          inputFormatConfiguration: {
            deserializer: {
              openXJsonSerDe: {}, // reads incoming JSON from IoT Core
            },
          },
          outputFormatConfiguration: {
            serializer: {
              parquetSerDe: {
                compression: 'SNAPPY', // good balance of speed and size
              },
            },
          },
          schemaConfiguration: {
            roleArn: firehoseRole.roleArn,
            databaseName: 'sensiq_history_db',
            tableName: 'sensor_data',
            region: this.region,
            versionId: 'LATEST',
          },
        },

        // Firehose buffers before writing — minimum values to keep latency low
        bufferingHints: {
          intervalInSeconds: 60,   // flush every 60s
          sizeInMBs: 64,           // or when buffer hits 64MB
        },
      },
    });

    // --- IoT Rule: wire HistoryRule to Firehose ---
    const iotFirehoseRole = new iam.Role(this, 'IotFirehoseRole', {
      assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
    });

    iotFirehoseRole.addToPolicy(new iam.PolicyStatement({
      actions: ['firehose:PutRecord'],
      resources: [firehoseStream.attrArn],
    }));

    new iot.TopicRule(this, 'HistoryRule', {
      sql: iot.IotSql.fromStringAsVer20160323("SELECT * FROM 'sensiq/+/data'"),
      actions: [
        new actions.FirehosePutRecordAction(
          // L2 construct wrapping the CfnDeliveryStream
          firehose.DeliveryStream.fromDeliveryStreamArn(this, 'ImportedFirehose', firehoseStream.attrArn),
          { batchMode: false }
        ),
      ],
    });

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