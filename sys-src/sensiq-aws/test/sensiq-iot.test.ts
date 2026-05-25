import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { IotCoreStack } from '../lib/sensiq-iot-stack'; 

test('IoT Core Rules and Log Groups Created Successfully', () => {
  const app = new cdk.App();
  
  const stack = new IotCoreStack(app, 'TestIotStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/iot/esp32/all_messages'
  });
  
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/iot/esp32/alerts'
  });

  template.hasResourceProperties('AWS::IoT::TopicRule', {
    TopicRulePayload: {
      Sql: "SELECT * FROM 'sensiq/+/data'"
    }
  });

  template.hasResourceProperties('AWS::IoT::TopicRule', {
    TopicRulePayload: {
      Sql: "SELECT temperature FROM 'sensiq/+/data'"
    }
  });
});