import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export class SensiqAthenaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // S3 bucket for incoming IoT data.
        // It is expected that AWS Firehose will write Parquet files to this bucket.
        const dataBucket = new s3.Bucket(this, 'SensiqHistoryIoTDataBucket', {
            bucketName: 'sensiq-history-iot-data-bucket', // globally unique
            versioned: false, // higher costs, but also prevents accidental data loss
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // blocking all public access
            removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
            // autoDeleteObjects: true, // required if RemovalPolicy.DESTROY
            lifecycleRules: [{ expiration: cdk.Duration.days(10 * 365) }], // auto-delete after 10 years
        });

        // S3 Bucket for Athena query results, with lifecycle policy to clean up old results.
        // The data is handled much more temporarily, so deletion is more aggressive.
        const queryResultsBucket = new s3.Bucket(this, 'SensiqHistoryAthenaQueryResults', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [{ expiration: cdk.Duration.days(1) }] // more aggressive cleanup
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

        // Lambda Function for API Gateway
        // Python lambda function in lambda/history/handle_history_data.py with handle_history_data.handler()
        const lambdaHandleHistoryData = new lambda.Function(this, 'HandleHistoryData', {
            code: lambda.Code.fromAsset('lambda/history'),
            handler: 'handle_history_data.handler',
            runtime: lambda.Runtime.PYTHON_3_12,
            timeout: cdk.Duration.seconds(29), // API Gateway max timeout limit
            environment: {
                ATHENA_WORKGROUP: workgroup.name,
                DATABASE_NAME: glueDatabaseName,
            }
        });

        // IAM Permissions for Lambda to query Athena and read from S3
        // ARN: Amazon Resource Name for referencing AWS resources.
        // cdk.Arn.format builds an ARN string in a strict format: arn:aws:glue:<region>:<account>:<resourceType>/<resourceName>
        const glueCatalogArn = cdk.Arn.format({ service: 'glue', resource: 'catalog' }, this);
        const glueDatabaseArn = cdk.Arn.format({ service: 'glue', resource: 'database', resourceName: glueDatabaseName }, this);
        const glueTableArn = cdk.Arn.format({ service: 'glue', resource: 'table', resourceName: `${glueDatabaseName}/${tableName}` }, this);
        const athenaWorkgroupArn = cdk.Arn.format({ service: 'athena', resource: 'workgroup', resourceName: workgroup.name }, this);

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