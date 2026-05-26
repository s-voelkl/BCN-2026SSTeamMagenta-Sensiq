import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class SensiqAthenaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // S3 bucket for incoming IoT data.
        // It is expected that AWS Firehose will write Parquet files to this bucket.
        const dataBucket = new s3.Bucket(this, 'SensiqHistoryIoTDataBucket', {
            removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
            // autoDeleteObjects: true, // required if RemovalPolicy.DESTROY
            lifecycleRules: [{ expiration: cdk.Duration.days(10 * 365) }] // auto-delete after 10 years
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
                partitionKeys: [
                    { name: 'year', type: 'string' },
                    { name: 'month', type: 'string' },
                    { name: 'day', type: 'string' }
                ],
                storageDescriptor: {
                    location: `s3://${dataBucket.bucketName}/data/`,
                    inputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
                    outputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
                    serdeInfo: {
                        serializationLibrary: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
                    },
                    // columns are expected to change over time!
                    columns: [
                        { name: 'running_time', type: 'bigint' },
                        { name: 'timestamp', type: 'timestamp' },
                        { name: 'device_id', type: 'string' },
                        { name: 'location', type: 'string' },
                        { name: 'dht_humidity', type: 'int' },
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
        const handleHistoryData = new nodejs.NodejsFunction(this, 'HandleHistoryData', {
            entry: 'lambda/history/index.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            timeout: cdk.Duration.seconds(29), // API Gateway max timeout limit
            environment: {
                ATHENA_WORKGROUP: workgroup.name,
                DATABASE_NAME: glueDatabaseName,
            }
        });

        // IAM Permissions for Lambda to query Athena and read from S3
        handleHistoryData.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'athena:StartQueryExecution',
                'athena:GetQueryExecution',
                'athena:GetQueryResults',
                'glue:GetTable',
                'glue:GetDatabase'
            ],
            // TODO: Scope down permissions to specific resources if possible, currently using wildcard for simplicity
            resources: ['*']
        }));

        dataBucket.grantRead(handleHistoryData);
        queryResultsBucket.grantReadWrite(handleHistoryData);
    }
}