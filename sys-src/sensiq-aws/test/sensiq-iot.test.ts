import * as cdk from 'aws-cdk-lib';
import { IotCoreStack } from '../infra/sensiq-iot-stack'; 
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqAthenaStack } from '../infra/sensiq-athena-stack';

let template: Template;

beforeAll(() => {
    const app = new cdk.App();
    const athenaStack = new SensiqAthenaStack(app, 'TestAthenaStack');
    const stack = new IotCoreStack(app, 'TestIotStack', { athenaStack });
    template = Template.fromStack(stack);
});

test('Lambda has correct runtime and timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'python3.12',
        Timeout: 15,
    });
});

test('LiveRule has correct SQL topic filter', () => {
    template.hasResourceProperties('AWS::IoT::TopicRule', {
        TopicRulePayload: {
            Sql: "SELECT * FROM 'sensiq/+/data'",
        },
    });
});

test('LiveRule action points to the validation Lambda', () => {
    template.hasResourceProperties('AWS::IoT::TopicRule', {
        TopicRulePayload: {
            Actions: [{ Lambda: {} }],
        },
    });
});

test('Firehose delivery stream exists', () => {
    template.hasResource('AWS::KinesisFirehose::DeliveryStream', {});
});

test('Firehose has DirectPut as source', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        DeliveryStreamType: 'DirectPut',
    });
});

test('Firehose S3 destination points to data bucket', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            Prefix: 'data/year=!{partitionKeyFromQuery:year}/month=!{partitionKeyFromQuery:month}/day=!{partitionKeyFromQuery:day}/',
        },
    });
});

test('Firehose error prefix is configured', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            ErrorOutputPrefix: Match.stringLikeRegexp('errors/'),
        },
    });
});

test('Firehose has Parquet output format conversion enabled', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            DataFormatConversionConfiguration: {
                Enabled: true,
                OutputFormatConfiguration: {
                    Serializer: {
                        ParquetSerDe: {},
                    },
                },
            },
        },
    });
});

test('Firehose schema configuration references correct Glue database and table', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            DataFormatConversionConfiguration: {
                SchemaConfiguration: {
                    DatabaseName: 'sensiq_history_db',
                    TableName: 'sensor_data',
                },
            },
        },
    });
});

test('Firehose dynamic partitioning is enabled', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            DynamicPartitioningConfiguration: {
                Enabled: true,
            },
        },
    });
});

test('Firehose MetadataExtraction processor uses JQ with correct timestamp query', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            ProcessingConfiguration: {
                Enabled: true,
                Processors: Match.arrayWith([
                    Match.objectLike({
                        Type: 'MetadataExtraction',
                        Parameters: Match.arrayWith([
                            {
                                ParameterName: 'MetadataExtractionQuery',
                                // important: extraction of partition keys from timestamp
                                ParameterValue: '{year: .timestamp[0:4], month: .timestamp[5:7], day: .timestamp[8:10]}',
                            },
                            {
                                ParameterName: 'JsonParsingEngine',
                                ParameterValue: 'JQ-1.6',
                            },
                        ]),
                    }),
                ]),
            },
        },
    });
});

test('Firehose buffering interval is 60 seconds (minimum for dynamic partitioning)', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            BufferingHints: {
                IntervalInSeconds: 60,
            },
        },
    });
});

test('Firehose buffering size is 64MB (minimum for dynamic partitioning)', () => {
    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
        ExtendedS3DestinationConfiguration: {
            BufferingHints: {
                SizeInMBs: 64,
            },
        },
    });
});

test('HistoryRule action points to Firehose stream', () => {
    template.hasResourceProperties('AWS::IoT::TopicRule', {
        TopicRulePayload: {
            Sql: "SELECT * FROM 'sensiq/+/data'",
            Actions: Match.arrayWith([
                Match.objectLike({ Firehose: {} }),
            ]),
        },
    });
});

test('Firehose IAM role trusts Firehose service principal', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
            Statement: Match.arrayWith([
                Match.objectLike({
                    Principal: { Service: 'firehose.amazonaws.com' },
                    Action: 'sts:AssumeRole',
                }),
            ]),
        },
    });
});