import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { SensiqCdkStack } from '../lib/sensiq-cdk-stack';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/sensiq-aws-stack.ts
test('SQS Queue Created', () => {
    const app = new cdk.App();
    //     // WHEN
    const stack = new SensiqCdkStack(app, 'SensiqCdkStack');
    //     // THEN
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SQS::Queue', {
        VisibilityTimeout: 300
    });
});
