import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import path from 'path';


export class SensiqHistoryStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // S3 bucket for incoming IoT data.
        // It is expected that AWS Firehose will write Parquet files to this bucket.
        const dataBucket = new s3.Bucket(this, 'SensiqHistoryIoTDataBucket', {
            // bucketName: "" // removed, for multi-environment readiness
            encryption: s3.BucketEncryption.S3_MANAGED, // server-side encryption with S3-managed keys
            versioned: true, // higher costs, but also prevents accidental data loss
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // blocking all public access
            removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
            // autoDeleteObjects: true, // required if RemovalPolicy.DESTROY
            lifecycleRules: [{ expiration: cdk.Duration.days(10 * 365) }], // auto-delete after 10 years
        });

        // S3 Bucket for Athena query results, with lifecycle policy to clean up old results.
        // The data is handled much more temporarily, so deletion is more aggressive.
        const queryResultsBucket = new s3.Bucket(this, 'SensiqHistoryAthenaQueryResults', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [{ expiration: cdk.Duration.days(1) }], // more aggressive cleanup
        });

        // Glue Database
        const glueDatabaseName = 'sensiq_history_db';
        const glueDatabase = new glue.CfnDatabase(this, 'SensiqHistoryGlueDatabase', {
            catalogId: this.account,
            databaseInput: {
                name: glueDatabaseName,
                description: 'Database for Sensiq historical sensor data storage',
            },
        });

        // Glue Table for Parquet Data with Partition Projection
        const tableName = 'sensor_data';
        const table = new glue.CfnTable(this, 'SensiqHistoryGlueTable', {
            catalogId: this.account,
            databaseName: glueDatabaseName,
            tableInput: {
                name: tableName,
                tableType: 'EXTERNAL_TABLE',
                // Athena Partition Projection settings for automatic detection of new partitions
                parameters: {
                    'classification': 'parquet',
                    'has_encrypted_data': 'false',
                    // Partition Projection settings for automatic detection of new years/months/days
                    'projection.enabled': 'true',
                    'projection.year.type': 'integer',
                    'projection.year.min': '2020',
                    'projection.year.max': '9999', // safe upper bound limit for safe projection boundary
                    'projection.year.digits': '4',
                    'projection.month.type': 'integer',
                    'projection.month.range': '1,12',
                    'projection.month.digits': '2',
                    'projection.day.type': 'integer',
                    'projection.day.range': '1,31',
                    'projection.day.digits': '2',
                    'storage.location.template': `s3://${dataBucket.bucketName}/data/year=\${year}/month=\${month}/day=\${day}/`,
                },
                // efficient partitioning and querying by year/month/day
                partitionKeys: [
                    { name: 'year', type: 'string' },
                    { name: 'month', type: 'string' },
                    { name: 'day', type: 'string' }
                ],
                // defines data schema and Parquet reader/writer settings
                storageDescriptor: {
                    location: `s3://${dataBucket.bucketName}/data/`,
                    inputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat', // Parquet input format
                    outputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat', // Parquet output format
                    serdeInfo: {
                        serializationLibrary: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe', // Parquet SerDe
                    },
                    // columns are expected to change over time!
                    columns: [
                        { name: 'running_time', type: 'bigint' },
                        { name: 'timestamp', type: 'timestamp' }, // better for time-based queries than string
                        { name: 'device_id', type: 'string' },
                        { name: 'location', type: 'string' },
                        { name: 'dht_humidity', type: 'double' },
                        { name: 'dht_temperature', type: 'double' },
                        { name: 'dht_heat_index', type: 'double' },
                        { name: 'flame_analog', type: 'int' },
                        { name: 'flame_digital', type: 'boolean' },
                        { name: 'thermistor_analog', type: 'int' },
                        { name: 'thermistor_digital', type: 'boolean' },
                        { name: 'thermistor_temp', type: 'double' }
                    ],
                },
            },
        });
        table.addDependency(glueDatabase);

        // Athena Workgroup: Configures a workgroup for the query results to be stored in a S3 bucket.
        const workgroup = new athena.CfnWorkGroup(this, 'SensiqHistoryAthenaWorkGroup', {
            name: 'SensiqHistoryAthenaWorkGroup',
            workGroupConfiguration: {
                resultConfiguration: {
                    outputLocation: `s3://${queryResultsBucket.bucketName}/results/`,
                },
            },
        });

        // IAM Permissions for Lambda to query Athena and read from S3
        // ARN: Amazon Resource Name for referencing AWS resources.
        // cdk.Arn.format builds an ARN string in a strict format: arn:aws:glue:<region>:<account>:<resourceType>/<resourceName>
        const glueCatalogArn = cdk.Arn.format({ service: 'glue', resource: 'catalog' }, this);
        const glueDatabaseArn = cdk.Arn.format({ service: 'glue', resource: 'database', resourceName: glueDatabaseName }, this);
        const glueTableArn = cdk.Arn.format({ service: 'glue', resource: 'table', resourceName: `${glueDatabaseName}/${tableName}` }, this);
        const athenaWorkgroupArn = cdk.Arn.format({ service: 'athena', resource: 'workgroup', resourceName: workgroup.name }, this);

        // IAM Role for Firehose with necessary permissions for Glue schema validation and S3 access
        const firehoseRole = new iam.Role(this, 'FirehoseRole', {
            assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
            inlinePolicies: {
                FirehoseGlueAndS3Policy: new iam.PolicyDocument({
                    statements: [
                        // Explicitly listed Glue actions for format conversion validation
                        new iam.PolicyStatement({
                            actions: [
                                'glue:GetDatabase',
                                'glue:GetTable',
                                'glue:GetTableVersion',
                                'glue:GetTableVersions'
                            ],
                            resources: [glueCatalogArn, glueDatabaseArn, glueTableArn],
                        }),
                        // Necessary S3 permissions for delivery destinations
                        new iam.PolicyStatement({
                            actions: [
                                's3:AbortMultipartUpload',
                                's3:GetBucketLocation',
                                's3:GetObject',
                                's3:ListBucket',
                                's3:ListBucketMultipartUploads',
                                's3:PutObject'
                            ],
                            resources: [
                                dataBucket.bucketArn,
                                `${dataBucket.bucketArn}/*`
                            ],
                        })
                    ]
                })
            }
        });

        // --- Firehose Delivery Stream ---
        // Input: DirectPut from IoT Rule (JSON messages from IoT Core)
        // Output: Parquet files in S3 with dynamic partitioning by year/month/day, and error logging for failed records
        const firehoseStream = new firehose.CfnDeliveryStream(this, 'SensiqHistoryFirehose', {
            deliveryStreamType: 'DirectPut',
            extendedS3DestinationConfiguration: {
                bucketArn: dataBucket.bucketArn,
                roleArn: firehoseRole.roleArn,
                prefix: 'data/year=!{partitionKeyFromQuery:year}/month=!{partitionKeyFromQuery:month}/day=!{partitionKeyFromQuery:day}/',
                // error logging for failed records, with same partitioning structure for easier debugging
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
                        catalogId: this.account,
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

        // Lambda Function for API Gateway
        // Python lambda function in lambda/history/handle_history_data.py with handle_history_data.handler()
        const lambdaHandleHistoryData = new PythonFunction(this, 'HandleHistoryData', {
            entry: path.join(__dirname, '..', 'src', 'lambda', 'history'), // points to the directory containing the lambda function code
            index: 'handle_history_data.py', // the file containing the lambda handler
            handler: 'handler',
            runtime: lambda.Runtime.PYTHON_3_12,
            timeout: cdk.Duration.seconds(15), // timeout reduced, to support cost-efficient asynchronous trigger pattern
            environment: {
                ATHENA_WORKGROUP: workgroup.name,
                DATABASE_NAME: glueDatabaseName,
            }
        });

        lambdaHandleHistoryData.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'athena:StartQueryExecution',
                'athena:GetQueryExecution',
                'athena:GetQueryResults',
            ],
            resources: [athenaWorkgroupArn]
        }));

        // Gives lambda read-access for the Glue Catalog, Database, and Table.
        // Lambda starts an Athena query that references the Glue Table, so permissions are needed.
        lambdaHandleHistoryData.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'glue:GetTable',
                'glue:GetDatabase'
            ],
            resources: [glueCatalogArn, glueDatabaseArn, glueTableArn]
        }));

        // L3-Construct-Comfort-Function: 
        // Enables the lambda to read parquet files from the dataBucket and write temporary Athena 
        // query outputs and metadata to the queryResultsBucket and returns the results
        dataBucket.grantRead(lambdaHandleHistoryData);
        queryResultsBucket.grantReadWrite(lambdaHandleHistoryData);
    }
}