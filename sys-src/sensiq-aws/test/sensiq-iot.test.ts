import * as cdk from 'aws-cdk-lib';
import { SensiqLiveStack } from '../infra/sensiq-live-stack'; 
import { Template} from 'aws-cdk-lib/assertions';

let template: Template;

beforeAll(() => {
    const app = new cdk.App();
    const stack = new SensiqLiveStack(app, 'TestLiveStack',);
    template = Template.fromStack(stack);
});

test('Lambda has correct runtime and timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'python3.12',
        Timeout: 15,
    });
});

test('LiveRule has correct SQL topic filter', () => {
    template.hasResourceProperties('AWS::IoT::TopicRule', {
        TopicRulePayload: {
            Sql: "SELECT * FROM 'sensiq/+/data'",
        },
    });
});

test('LiveRule action points to the validation Lambda', () => {
    template.hasResourceProperties('AWS::IoT::TopicRule', {
        TopicRulePayload: {
            Actions: [{ Lambda: {} }],
        },
    });
});

