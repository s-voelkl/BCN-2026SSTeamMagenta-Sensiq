import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqLiveStack } from '../infra/sensiq-live-stack';

let template: Template;

beforeAll(() => {
    const app = new cdk.App();
    const stack = new SensiqLiveStack(app, 'TestLiveStack');
    template = Template.fromStack(stack);
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