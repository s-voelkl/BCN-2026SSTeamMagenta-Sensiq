import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqHistoryStack } from '../infra/sensiq-history-stack';

let template: Template;
beforeAll(() => {
    const app = new cdk.App();
    const stack = new SensiqHistoryStack(app, 'TestHistoryStack');
    template = Template.fromStack(stack);
});

test('Athena Stack creates necessary resources', () => {
    // S3 data bucket with correct properties
    template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
            Status: 'Enabled'
        },
        BucketEncryption: {
            ServerSideEncryptionConfiguration: [
                {
                    ServerSideEncryptionByDefault: {
                        SSEAlgorithm: 'AES256'
                    }
                }
            ]
        },
        PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true
        }
    });

    // Query Results Bucket
    template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
            ServerSideEncryptionConfiguration: [
                {
                    ServerSideEncryptionByDefault: {
                        SSEAlgorithm: 'AES256'
                    }
                }
            ]
        },
        LifecycleConfiguration: {
            Rules: Match.arrayWith([
                Match.objectLike({
                    ExpirationInDays: 1,
                    Status: 'Enabled'
                })
            ])
        }
    });

    // Glue Database
    template.hasResourceProperties('AWS::Glue::Database', {
        CatalogId: { "Ref": "AWS::AccountId" },
        DatabaseInput: {
            Name: 'sensiq_history_db',
            Description: Match.anyValue()
        }
    });

    // Glue Table
    template.hasResourceProperties('AWS::Glue::Table', {
        DatabaseName: 'sensiq_history_db',
        TableInput: {
            Name: 'sensor_data',
            TableType: 'EXTERNAL_TABLE',
            Parameters: Match.objectLike({
                'classification': 'parquet',
                'has_encrypted_data': 'false',
                'projection.enabled': 'true',
                'projection.year.type': 'integer',
                'projection.year.min': '2020',
                'projection.year.max': '9999',
                'projection.year.digits': '4',
                'projection.month.type': 'integer',
                'projection.month.range': '1,12',
                'projection.month.digits': '2',
                'projection.day.type': 'integer',
                'projection.day.range': '1,31',
                'projection.day.digits': '2',
                'storage.location.template': Match.anyValue()
            }),
            PartitionKeys: [
                { Name: 'year', Type: 'string' },
                { Name: 'month', Type: 'string' },
                { Name: 'day', Type: 'string' }
            ],
            StorageDescriptor: Match.objectLike({
                Location: Match.anyValue(),
                InputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat', // Parquet input format
                OutputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat', // Parquet output format
                SerdeInfo: {
                    SerializationLibrary: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe' // Parquet SerDe
                },
                Columns: Match.arrayWith([
                    { Name: 'running_time', Type: 'bigint' },
                    { Name: 'timestamp', Type: 'timestamp' },
                    { Name: 'device_id', Type: 'string' },
                    { Name: 'dht_temperature', Type: 'double' }
                ])
            })
        }
    });

    // Athena WorkGroup
    template.hasResourceProperties('AWS::Athena::WorkGroup', {
        Name: 'SensiqHistoryAthenaWorkGroup',
        WorkGroupConfiguration: Match.objectLike({
            ResultConfiguration: Match.objectLike({
                OutputLocation: Match.anyValue()
            })
        })
    });

    // Lambda Function
    template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'handle_history_data.handler',
        Runtime: 'python3.12',
        Timeout: 15,
        Environment: {
            Variables: Match.objectLike({
                ATHENA_WORKGROUP: Match.anyValue(),
                DATABASE_NAME: 'sensiq_history_db'
            })
        }
    });

    // Lambda IAM Role Policies (Permission scope down check)
    template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
                Match.objectLike({
                    Action: [
                        "athena:StartQueryExecution",
                        "athena:GetQueryExecution",
                        "athena:GetQueryResults"
                    ],
                    Effect: "Allow",
                    Resource: Match.anyValue()
                }),
                Match.objectLike({
                    Action: [
                        "glue:GetTable",
                        "glue:GetDatabase"
                    ],
                    Effect: "Allow",
                    Resource: Match.anyValue()
                })
            ])
        })
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
