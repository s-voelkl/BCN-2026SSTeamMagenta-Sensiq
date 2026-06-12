import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as eventschemas from 'aws-cdk-lib/aws-eventschemas';
import * as fs from 'fs';
import path from 'path';

/**
 * SensiqHistoryStack: CDK Stack for historical sensor data storage and querying.
 * 
 * This stack sets up the infrastructure for storing historical sensor data in S3,
 * defining a Glue schema for Athena querying, and configuring a Firehose delivery stream
 * to ingest data from IoT Core. It also includes a Lambda function for handling API Gateway
 * requests to query historical data via Athena.
 * 
 * Key components:
 * - S3 Buckets: One for raw IoT data (with Parquet conversion) and one for Athena query results.
 * - Glue Database and Table: Defines the schema for the historical sensor data with partitioning.
 * - Firehose Delivery Stream: Ingests JSON data from IoT Core, converts it to Parquet, and 
 *      stores it in S3 with dynamic partitioning.
 * - IAM Roles and Policies: Grants necessary permissions for Firehose to access Glue and 
 *      S3, and for Lambda to query Athena.
 * - Lambda Function: Handles API Gateway requests to execute Athena queries and return results.
 * - EventBridge Schemas: Defines shareable test events for the Lambda function, visible in the AWS Console.
 */
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
        // Saved to: <S3-BucketName>/results/<UUID>.csv
        const queryResultsBucket = new s3.Bucket(this, 'SensiqHistoryAthenaQueryResults', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            // Query results can be as big as 1MB files.
            // Still, S3 lifecycle expiration only supports whole-day granularity (1 day minimum).
            lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
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
        // See: https://eu-central-1.console.aws.amazon.com/glue/home?region=eu-central-1#/v2/data-catalog/tables
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
                    // A wide range (e.g. 2020,9999) causes Athena to enumerate millions of
                    // virtual partitions whenever no year predicate is supplied, making even trivial queries
                    // take tens of seconds.
                    // This needs to be wide enough to accommodate future data, 
                    // but not so wide as to cause performance issues.
                    'projection.year.range': '2026,2030',
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
                        { name: 'thermistor_temp', type: 'double' },
                        { name: 'is_outlier', type: 'boolean' },
                        { name: 'collect_training', type: 'boolean' }
                    ],
                },
            },
        });
        table.addDependency(glueDatabase);

        // Athena Workgroup: Configures a workgroup for the query results to be stored in a S3 bucket.
        // Can be used for manual testing, by using the here defined Athena Workgroup in the Console.
        // See: https://eu-central-1.console.aws.amazon.com/athena/home?region=eu-central-1#/query-editor
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

                // Firehose buffers before writing — larger buffers produce fewer, bigger Parquet files,
                // which dramatically reduces per-file overhead in Athena scans (small-files problem).
                // Bigger files are more efficient to query, but also increase latency 
                // and risk of data loss on failure, so a good balance must be found.
                bufferingHints: {
                    intervalInSeconds: 900,  // flush every 15 minutes
                    sizeInMBs: 128,          // or when buffer hits 128MB
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

        // CloudWatch log group for the lambda. 
        // Defined explicitly (instead of deprecated `logRetention` option).
        const lambdaHandleHistoryDataLogGroup = new logs.LogGroup(this, 'HandleHistoryDataLogGroup', {
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Lambda Function for API Gateway
        // Python lambda function in lambda/history/handle_history_data.py with handle_history_data.handler()
        const lambdaHandleHistoryData = new PythonFunction(this, 'HandleHistoryData', {
            entry: path.join(__dirname, '..', 'src', 'lambda', 'history'), // points to the directory containing the lambda function code
            index: 'handle_history_data.py', // the file containing the lambda handler
            handler: 'handler',
            runtime: lambda.Runtime.PYTHON_3_12,
            timeout: cdk.Duration.seconds(29), // aligned with API Gateway max timeout to accommodate Athena cold starts
            logGroup: lambdaHandleHistoryDataLogGroup,
            environment: {
                ATHENA_WORKGROUP: workgroup.name,
                DATABASE_NAME: glueDatabaseName,
                LOG_LEVEL: 'INFO',
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

        // Shareable Lambda test event (visible in the AWS Lambda Console under Test tab).
        // Lambda reads these from EventBridge Schemas: registry 'lambda-testevent-schemas',
        // schema name '_<FunctionName>-schema'. The schema is OpenAPI 3.0 with the event as an example.
        const testEventPath = path.join(__dirname, '..', 'src', 'lambda', 'history', 'test_event.json');
        const testEventJson = JSON.parse(fs.readFileSync(testEventPath, 'utf-8'));

        const testEventRegistry = new eventschemas.CfnRegistry(this, 'LambdaTestEventRegistry', {
            registryName: 'lambda-testevent-schemas',
            description: 'Registry for shareable Lambda test events (consumed by the Lambda console).',
        });

        const testEventSchema = new eventschemas.CfnSchema(this, 'HandleHistoryDataTestEventSchema', {
            registryName: 'lambda-testevent-schemas',
            schemaName: `_${lambdaHandleHistoryData.functionName}-schema`,
            type: 'OpenApi3',
            description: 'Shareable test event for HandleHistoryData lambda (API Gateway proxy GET /history).',
            content: JSON.stringify({
                openapi: '3.0.0',
                info: { version: '1.0.0', title: 'Event' },
                paths: {},
                components: {
                    schemas: {
                        Event: {
                            type: 'object',
                            properties: { eventName: { type: 'string' } },
                            example: testEventJson,
                            'x-amazon-events-detail-type': 'apiGatewayHistoryGet',
                            'x-amazon-events-source': 'aws.lambda',
                        },
                    },
                    examples: {
                        apiGatewayHistoryGet: { value: testEventJson },
                    },
                },
            }),
        });
        testEventSchema.addDependency(testEventRegistry);
    }
}