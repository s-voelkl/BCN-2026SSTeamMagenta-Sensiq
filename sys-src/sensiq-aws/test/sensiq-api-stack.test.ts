import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqApiStack } from '../infra/sensiq-api-stack';

let template: Template;

beforeAll(() => {
    const app = new cdk.App();

    // Test-only stack for dummy Lambda functions.
    // The API stack receives Lambda references via props, just like in the real app
    // where live and history Lambdas are created in their own domain stacks.
    const dependencyStack = new cdk.Stack(app, 'TestDependencyStack');

    const liveFunction = new lambda.Function(dependencyStack, 'TestLiveFunction', {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'index.handler',
        code: lambda.Code.fromInline('def handler(event, context): return {"statusCode": 200}'),
    });

    const historyFunction = new lambda.Function(dependencyStack, 'TestHistoryFunction', {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'index.handler',
        code: lambda.Code.fromInline('def handler(event, context): return {"statusCode": 200}'),
    });

    const stack = new SensiqApiStack(app, 'TestApiStack', {
        liveFunction,
        historyFunction,
    });

    template = Template.fromStack(stack);
});

test('API Gateway REST API is created', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'sensiq-api',
        Description: 'REST API for Sensiq live and historical sensor data.',
    });
});

test('GET /live route is created with Lambda proxy integration', () => {
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'live',
    });

    template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
        AuthorizationType: 'NONE',
        Integration: Match.objectLike({
            Type: 'AWS_PROXY',
            IntegrationHttpMethod: 'POST',
        }),
    });
});

test('GET /history route is created with Lambda proxy integration', () => {
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'history',
    });

    template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
        AuthorizationType: 'NONE',
        Integration: Match.objectLike({
            Type: 'AWS_PROXY',
            IntegrationHttpMethod: 'POST',
        }),
    });
});

test('CORS OPTIONS methods are configured', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'OPTIONS',
        Integration: Match.objectLike({
            Type: 'MOCK',
        }),
    });
});

test('API Gateway has permissions to invoke Lambda functions', () => {
    template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
    });
});

test('API URL output is created', () => {
    template.hasOutput('SensiqApiUrl', {
        Value: Match.anyValue(),
    });
});
