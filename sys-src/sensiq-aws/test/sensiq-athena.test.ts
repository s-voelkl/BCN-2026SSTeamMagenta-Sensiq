import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqAthenaStack } from '../lib/sensiq-athena-stack';

test('Athena Stack creates necessary resources', () => {
    const app = new cdk.App();
    const stack = new SensiqAthenaStack(app, 'TestAthenaStack');
    const template = Template.fromStack(stack);

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
