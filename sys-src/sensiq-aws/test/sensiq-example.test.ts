import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { SensiqExampleStack } from '../lib/sensiq-example-stack';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/sensiq-aws-stack.ts
test('SQS Queue Created', () => {
    const app = new cdk.App();
    //     // WHEN
    const stack = new SensiqExampleStack(app, 'SensiqExampleStack');
    //     // THEN
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SQS::Queue', {
        VisibilityTimeout: 300
    });
});
