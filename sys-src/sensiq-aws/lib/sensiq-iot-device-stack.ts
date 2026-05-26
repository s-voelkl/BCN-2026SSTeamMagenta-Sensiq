import * as cdk from 'aws-cdk-lib';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class SensiqIotDeviceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const thingNameGeneral = 'esp32-';
    const thingNameSpecific = thingNameGeneral + 'lab-001';

    const thing = new iot.CfnThing(this, 'SensiqESP32Thing', {
      thingName: thingNameSpecific,
    });

    // Cert creation -> SAFE the console output! It has to be put into the ESP manually.
    // Note: Since only onCreate and onDelete are defined (no onUpdate), the certificates
    // are only generated once during initial stack creation and remain unchanged during stack updates.
    const createCert = new cr.AwsCustomResource(this, 'CreateCert', {
      onCreate: {
        service: 'Iot',
        action: 'createKeysAndCertificate',
        parameters: { setAsActive: true },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('certificateId'),
        outputPaths: ['certificateArn', 'certificatePem', 'keyPair.PrivateKey', 'certificateId'],
      },
      // important for cleanup when stack is destroyed -> otherwise certs would pile up in the AWS account
      onDelete: {
        service: 'Iot',
        action: 'updateCertificate',
        parameters: {
          certificateId: new cr.PhysicalResourceIdReference(),
          newStatus: 'INACTIVE',
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    const certArn = createCert.getResponseField('certificateArn');
    const certPem = createCert.getResponseField('certificatePem');
    const privKey = createCert.getResponseField('keyPair.PrivateKey');

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    const policy = new iot.CfnPolicy(this, 'SensiqESP32Policy', {
      policyName: 'Sensiq_ESP32_Mqtt_Policy',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          // Testing only: universal permissions for all iot actions and resources.
          // {
          //   Effect: 'Allow',
          //   Action: 'iot:*',
          //   Resource: '*'
          // },
          // granular permissions for every iot action (could be more granular)
          {
            Effect: 'Allow',
            Action: 'iot:Connect',
            Resource: `arn:aws:iot:${region}:${account}:client/${thingNameGeneral}*` // could be further restricted, but it is ok for now
          },
          // data topic for sensor data sending
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/data` // same here
          },
          {
            Effect: 'Allow',
            Action: 'iot:Subscribe',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/data` // same here
          },
          {
            Effect: 'Allow',
            Action: 'iot:Receive',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/data` // same here
          },
          // test topic for automatic and manual testing
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/test` // same here
          },
          {
            Effect: 'Allow',
            Action: 'iot:Subscribe',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/test` // same here
          },
          {
            Effect: 'Allow',
            Action: 'iot:Receive',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/test` // same here
          },
          // command topic for receiving commands from the backend
          {
            Effect: 'Allow',
            Action: 'iot:Subscribe',
            Resource: `arn:aws:iot:${region}:${account}:topicfilter/sensiq/${thingNameGeneral}*/commands` // same here
          },
          {
            Effect: 'Allow',
            Action: 'iot:Receive',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/commands` // same here
          },
        ],
      },
    });

    new iot.CfnPolicyPrincipalAttachment(this, 'PolicyAttach', {
      policyName: policy.policyName!,
      principal: certArn,
    });

    // Use thing.ref and an explicit dependency to ensure CloudFormation creates
    // the IoT Thing BEFORE attempting to attach the certificate. Using a hardcoded
    // string causes a ResourceNotFoundException due to premature attachment.
    const thingAttach = new iot.CfnThingPrincipalAttachment(this, 'ThingAttach', {
      thingName: thing.ref,
      principal: certArn,
    });
    thingAttach.addDependency(thing);

    new cdk.CfnOutput(this, 'DeviceCertificatePem', { value: certPem });
    new cdk.CfnOutput(this, 'DevicePrivateKey', { value: privKey });
  }
}