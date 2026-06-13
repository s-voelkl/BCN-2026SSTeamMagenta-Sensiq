import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqLiveStack } from '../infra/sensiq-live-stack';

let template: Template;

beforeAll(() => {
    const app = new cdk.App();
    const stack = new SensiqLiveStack(app, 'TestLiveStack');
    template = Template.fromStack(stack);
});

test('Email subscription is created when alertEmail context is provided', () => {
    const app = new cdk.App({
        context: { alertEmail: 'test@example.com' },
    });
    const stack = new SensiqLiveStack(app, 'TestLiveStackWithEmail');
    const t = Template.fromStack(stack);

    t.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
        Endpoint: 'test@example.com',
    });

    // No CfnOutput about missing alert email should be created
    const outputs = t.findOutputs('AlertEmailOutput');
    expect(Object.keys(outputs)).toHaveLength(0);
});

test('CfnOutput is created when alertEmail context is not provided', () => {
    const app = new cdk.App();
    const stack = new SensiqLiveStack(app, 'TestLiveStackNoEmail');
    const t = Template.fromStack(stack);

    t.hasOutput('AlertEmailOutput', {
        Value: Match.stringLikeRegexp('No alert email configured.*'),
    });

    // No email subscription should exist
    t.resourceCountIs('AWS::SNS::Subscription', 0);
});

test('Table created correctly', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'LiveDataDB',
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        },

        KeySchema: [
            {
                AttributeName: 'device_id',
                KeyType: 'HASH'
            }
        ]
    });
});

test('Validation Lambda created correctly', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'handle_validation.handler',
        Runtime: Match.stringLikeRegexp('python3.*'),
        Timeout: 29,
        Environment: {
            Variables: Match.objectLike({
                TABLE_NAME: Match.anyValue()
            })
        }
    });
});

test('Live Data Lambda Function created correctly', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'handle_live_data.handler',
        Runtime: Match.stringLikeRegexp('python3.*'),
        Timeout: 29,
        Environment: {
            Variables: Match.objectLike({
                TABLE_NAME: Match.anyValue()
            })
        }
    });
});


test('Lambdas have IAM permissions for DynamoDB', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
                Match.objectLike({
                    Effect: 'Allow',
                    Action: Match.arrayWith([
                        'dynamodb:PutItem'
                    ])
                })
            ])
        })
    });
});