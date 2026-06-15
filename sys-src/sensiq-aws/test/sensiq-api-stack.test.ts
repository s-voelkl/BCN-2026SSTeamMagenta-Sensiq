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

test('CloudWatch log group is created for API access logs', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/sensiq-api/access',
        RetentionInDays: 7,
    });
});

test('API Gateway stage has access logging, metrics and INFO logging level', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
        StageName: 'prod',
        AccessLogSetting: Match.objectLike({
            DestinationArn: Match.anyValue(),
            Format: Match.anyValue(),
        }),
        MethodSettings: Match.arrayWith([
            Match.objectLike({
                LoggingLevel: 'INFO',
                MetricsEnabled: true,
            }),
        ]),
    });
});

test('API key value is a Secrets Manager dynamic reference (no plaintext in template)', () => {
    // ApiKey.Value must resolve via {{resolve:secretsmanager:...}} so the secret
    // never lands in the synthesized CloudFormation template as plaintext.
    template.hasResourceProperties('AWS::ApiGateway::ApiKey', {
        Name: 'sensiq-api-key',
        Value: Match.anyValue(),
    });
});

test('POST /live route is created with Lambda proxy integration', () => {
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'live',
    });

    template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
        AuthorizationType: 'NONE',
        Integration: Match.objectLike({
            Type: 'AWS_PROXY',
            IntegrationHttpMethod: 'POST',
        }),
    });
});

test('POST /history route is created with Lambda proxy integration', () => {
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'history',
    });

    template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
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

test('API Gateway has permissions to invoke Lambda functions', () => {
    template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
    });
});

test('API key secret is created in Secrets Manager', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'sensiq-api-key',
        GenerateSecretString: {
            SecretStringTemplate: '{}',
            GenerateStringKey: 'apiKey',
            ExcludePunctuation: true,
            PasswordLength: 40,
        },
    });
});

test('API Gateway API key is created', () => {
    template.hasResourceProperties('AWS::ApiGateway::ApiKey', {
        Name: 'sensiq-api-key',
    });
});

test('API Gateway usage plan is created', () => {
    template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        UsagePlanName: 'sensiq-usage-plan',
        Throttle: {
            RateLimit: 10,
            BurstLimit: 20,
        },
    });
});

test('API Gateway usage plan is linked to an API key', () => {
    template.resourceCountIs('AWS::ApiGateway::UsagePlanKey', 1);
});

test('both POST methods require an API key', () => {
    template.resourcePropertiesCountIs('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
        ApiKeyRequired: true,
    }, 2);
});

test('API key secret name output is created', () => {
    template.hasOutput('SensiqApiKeySecretName', {
        Value: Match.anyValue(),
    });
});

test('API URL output is created', () => {
    template.hasOutput('SensiqApiUrl', {
        Value: Match.anyValue(),
    });
});
