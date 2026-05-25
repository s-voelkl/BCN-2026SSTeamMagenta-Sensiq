import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SensiqAthenaStack } from '../lib/sensiq-athena-stack';

test('Athena Stack Created Successfully', () => {
    const app = new cdk.App();

    const stack = new SensiqAthenaStack(app, 'TestAthenaStack');
    const template = Template.fromStack(stack);

    // template.hasResourceProperties('AWS::Athena::WorkGroup', {
    //   Name: 'WorkGroupName'
    // });

    // template.hasResourceProperties('AWS::Athena::Database', {
    //   Name: 'DatabaseName'
    // });
});