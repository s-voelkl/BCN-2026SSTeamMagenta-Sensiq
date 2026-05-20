import * as cdk from 'aws-cdk-lib';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class SensiqIotDeviceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const thingName = 'ESP32_Lab_001';

    const thing = new iot.CfnThing(this, 'SensiqESP32Thing', {
      thingName: thingName,
    });

    // Cert creation -> SAFE the console output!; has to be put into ESP manually
    const createCert = new cr.AwsCustomResource(this, 'CreateCert', {
      onCreate: {
        service: 'Iot',
        action: 'createKeysAndCertificate',
        parameters: { setAsActive: true },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('certificateId'),
        outputPaths: ['certificateArn', 'certificatePem', 'keyPair.PrivateKey', 'certificateId'],
      },
      onDelete: {
        service: 'Iot',
        action: 'deleteCertificate',
        parameters: { certificateId: new cr.PhysicalResourceIdReference(),
            forceDelete: true
         },
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    const certArn = createCert.getResponseField('certificateArn');
    const certPem = createCert.getResponseField('certificatePem');
    const privKey = createCert.getResponseField('keyPair.PrivateKey');

    const policy = new iot.CfnPolicy(this, 'SensiqESP32Policy', {
      policyName: 'Sensiq_ESP32_Mqtt_Policy',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: ['iot:Connect', 'iot:Publish', 'iot:Subscribe', 'iot:Receive'],
          Resource: ['*'], // more granular for deployment !!!
        }],
      },
    });

    new iot.CfnPolicyPrincipalAttachment(this, 'PolicyAttach', {
      policyName: policy.policyName!,
      principal: certArn,
    });

    new iot.CfnThingPrincipalAttachment(this, 'ThingAttach', {
      thingName: thing.thingName!,
      principal: certArn,
    });

    new cdk.CfnOutput(this, 'DeviceCertificatePem', { value: certPem });
    new cdk.CfnOutput(this, 'DevicePrivateKey', { value: privKey });
  }
}