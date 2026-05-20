import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as SensiqIotStack from '../lib/sensiq-iot-stack';

test('IoT Infrastructure Created', () => {
  const app = new cdk.App();
  
  const stack = new SensiqIotStack.SensiqIotStack(app, 'MyTestStack');
  
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IoT::Thing', {
    ThingName: 'ESP32_Lab_001'
  });

  template.hasResource('AWS::IoT::Policy', {
    Properties: {
      PolicyName: 'Sensiq_ESP32_Mqtt_Policy'
    }
  });

  template.hasResourceProperties('AWS::IoT::ThingPrincipalAttachment', {
    ThingName: 'ESP32_Lab_001'
  });

  template.hasResource('Custom::AWS', {});
});