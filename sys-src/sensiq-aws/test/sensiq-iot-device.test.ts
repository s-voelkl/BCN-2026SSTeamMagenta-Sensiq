import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqIotDeviceStack } from '../lib/sensiq-iot-device-stack';

let app: cdk.App;
let stack: SensiqIotDeviceStack;
let template: Template;

beforeEach(() => {
  app = new cdk.App();
  stack = new SensiqIotDeviceStack(app, 'TestStack');
  template = Template.fromStack(stack);
});


describe('IoT Thing', () => {
  it('creates exactly one IoT Thing', () => {
    template.resourceCountIs('AWS::IoT::Thing', 1);
  });

  it('names the thing "esp32-lab-001"', () => {
    template.hasResourceProperties('AWS::IoT::Thing', {
      ThingName: 'esp32-lab-001',
    });
  });
});


describe('Certificate custom resource', () => {
  it('creates a custom resource for the certificate', () => {
    template.resourceCountIs('Custom::AWS', 1);
  });

  it('exposes certificateArn, certificatePem, privateKey, and certificateId as output paths', () => {
    template.hasResourceProperties('Custom::AWS', {
      Create: Match.serializedJson(
        Match.objectLike({
          outputPaths: Match.arrayWith([
            'certificateArn',
            'certificatePem',
            'keyPair.PrivateKey',
            'certificateId',
          ]),
        })
      ),
    });
  });
});


describe('IoT Policy', () => {
  it('creates exactly one IoT Policy', () => {
    template.resourceCountIs('AWS::IoT::Policy', 1);
  });

  it('has exactly 9 policy statements (Connect, Publish×2, Subscribe×3, Receive×3)', () => {
    const resources = template.findResources('AWS::IoT::Policy');
    const statements = Object.values(resources)[0].Properties.PolicyDocument.Statement;
    expect(statements).toHaveLength(9);
  });
});


describe('Attachments', () => {
  it('creates a policy-to-principal attachment', () => {
    template.resourceCountIs('AWS::IoT::PolicyPrincipalAttachment', 1);
  });

  it('attaches the correct policy by name', () => {
    template.hasResourceProperties('AWS::IoT::PolicyPrincipalAttachment', {
      PolicyName: 'Sensiq_ESP32_Mqtt_Policy',
    });
  });

  it('creates a thing-to-principal attachment', () => {
    template.resourceCountIs('AWS::IoT::ThingPrincipalAttachment', 1);
  });

  it('thing attachment explicitly depends on the IoT Thing resource', () => {
    const resources = template.findResources('AWS::IoT::ThingPrincipalAttachment');
    const dependsOn: string[] = Object.values(resources)[0].DependsOn ?? [];
    const thingResources = Object.keys(template.findResources('AWS::IoT::Thing'));
    const overlaps = dependsOn.filter((d) => thingResources.includes(d));
    expect(overlaps.length).toBeGreaterThanOrEqual(1);
  });
});