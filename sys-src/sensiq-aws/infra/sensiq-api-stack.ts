import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Interface for the properties of the SensiqApiStack, which includes references to the Lambda
 * functions from the live and history stacks that will handle the GET /live and GET /history routes, respectively.
 */
export interface SensiqApiStackProps extends cdk.StackProps {
    liveFunction: lambda.IFunction;
    historyFunction: lambda.IFunction;
}

/**
 * Stack for the Sensiq API Gateway, serving live and historical sensor data.
 * 
 * This stack includes:
 * - An API Gateway REST API with two routes: GET /live and GET /history.
 * - An API key for authentication, stored securely in Secrets Manager.
 * - A usage plan to limit the number of requests and prevent abuse.
 * - CORS configuration to allow requests from any origin.
 * - The GET /live route is integrated with a Lambda function from the live stack, 
 *      which has permissions to read from the live DynamoDB table.
 * - The GET /history route is integrated with a Lambda function from the history stack, 
 *      which has permissions to query Athena and read from S3.
 */
export class SensiqApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SensiqApiStackProps) {
        super(scope, id, props);

        const apiKeySecret = new secretsmanager.Secret(this, 'SensiqApiKeySecret', {
            secretName: 'sensiq-api-key',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({}),
                generateStringKey: 'apiKey',
                excludePunctuation: true,
                passwordLength: 40,
            },
        });

        const accessLogGroup = new logs.LogGroup(this, 'SensiqApiAccessLogs', {
            logGroupName: '/aws/apigateway/sensiq-api/access',
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const api = new apigateway.RestApi(this, 'SensiqRestApi', {
            restApiName: 'sensiq-api',
            description: 'REST API for Sensiq live and historical sensor data.',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: ['GET', 'OPTIONS'],
                allowHeaders: ['Content-Type', 'x-api-key'],
            },
            deployOptions: {
                stageName: 'prod', // default stage name

                // send api access logs (ip, path, status, latency, ...) to CloudWatch Logs
                accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
                loggingLevel: apigateway.MethodLoggingLevel.INFO,

                // metrics like 4XXError, 5XXError, Latency, etc. 
                metricsEnabled: true,
            },
        });

        // unsafeUnwrap is safe here: secretValueFromJson produces a CloudFormation
        // dynamic reference ({{resolve:secretsmanager:...}}), not the plaintext key.
        // CloudFormation resolves it at deploy time, so the template never contains the secret.
        const apiKey = new apigateway.ApiKey(this, 'SensiqApiKey', {
            apiKeyName: 'sensiq-api-key',
            value: apiKeySecret.secretValueFromJson('apiKey').unsafeUnwrap(),
        });

        // Prevent abuse with rate limiting and burst capacity.
        // for real production use, these limits must grow
        const usagePlan = api.addUsagePlan('SensiqUsagePlan', {
            name: 'sensiq-usage-plan',
            throttle: {
                rateLimit: 10, // requests per second
                burstLimit: 20, // maximum concurrent requests
            },
            quota: {
                limit: 10000, // maximum requests per period
                period: apigateway.Period.DAY,
            },
            description: 'Prevents abuse of the Sensiq API by limiting request rates and total requests per day.',
        });

        usagePlan.addApiStage({
            stage: api.deploymentStage,
        });

        usagePlan.addApiKey(apiKey);

        // GET /live is handled by the live stack Lambda, which already has
        // read access to the LiveDataDB DynamoDB table.
        const live = api.root.addResource('live');
        live.addMethod('GET', new apigateway.LambdaIntegration(props.liveFunction), {
            apiKeyRequired: true,
        });

        // GET /history is handled by the history stack Lambda, which already has
        // the required Athena, Glue and S3 permissions.
        const history = api.root.addResource('history');
        history.addMethod('GET', new apigateway.LambdaIntegration(props.historyFunction), {
            apiKeyRequired: true,
        });

        new cdk.CfnOutput(this, 'SensiqApiUrl', {
            value: api.url,
            description: 'Base URL for the Sensiq API Gateway',
        });

        new cdk.CfnOutput(this, 'SensiqApiKeySecretName', {
            value: apiKeySecret.secretName,
            description: 'Name of the Secrets Manager secret containing the API key for the Sensiq API Gateway',
        });
    }
}
