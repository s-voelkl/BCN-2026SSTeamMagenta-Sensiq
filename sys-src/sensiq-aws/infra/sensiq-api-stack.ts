import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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
 * - CORS configuration to allow requests from any origin (adjustable as needed).
 * - The GET /live route is integrated with a Lambda function from the live stack, 
 *      which has permissions to read from the live DynamoDB table.
 * - The GET /history route is integrated with a Lambda function from the history stack, 
 *      which has permissions to query Athena and read from S3.
 */
export class SensiqApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SensiqApiStackProps) {
        super(scope, id, props);

        const apiKeySecret = new secretsmanager.Secret(this, 'SensiqApiKeySecretV2', {
            secretName: 'sensiq-api-key',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({}),
                generateStringKey: 'apiKey',
                excludePunctuation: true,
                passwordLength: 40,
            },
        });

        const api = new apigateway.RestApi(this, 'SensiqRestApi', {
            restApiName: 'sensiq-api',
            description: 'REST API for Sensiq live and historical sensor data.',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: ['GET', 'OPTIONS'],
                allowHeaders: ['Content-Type', 'x-api-key'],
            },
        });

        const apiKey = new apigateway.ApiKey(this, 'SensiqApiKey', {
            apiKeyName: 'sensiq-api-key',
            value: apiKeySecret.secretValueFromJson('apiKey').unsafeUnwrap(),
        });

        const usagePlan = api.addUsagePlan('SensiqUsagePlan', {
            name: 'sensiq-usage-plan',
            throttle: {
                rateLimit: 10,
                burstLimit: 20,
            },
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
        });

        new cdk.CfnOutput(this, 'SensiqApiKeySecretName', {
            value: apiKeySecret.secretName,
        });
    }
}
