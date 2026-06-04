import * as cdk from 'aws-cdk-lib';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class SensiqIotDeviceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const thingNameGeneral = 'esp32-';
    const thingNameSpecific = thingNameGeneral + 'lab-001';

    const thing = new iot.CfnThing(this, 'SensiqESP32Thing', {
      thingName: thingNameSpecific,
    });

    // Creates the certificate on first deploy only.
    // onUpdate reads the existing cert via describeCertificate to avoid
    // regenerating it on every stack update — the private key is only
    // returned once by AWS, so recreating it would break the physical device.
    const createCert = new cr.AwsCustomResource(this, 'CreateCert', {
      onCreate: {
        service: 'Iot',
        action: 'createKeysAndCertificate',
        parameters: { setAsActive: true },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('certificateId'),
        outputPaths: ['certificateArn', 'certificatePem', 'keyPair.PrivateKey', 'certificateId'],
      },
      onUpdate: {
        service: 'Iot',
        action: 'describeCertificate',
        parameters: { certificateId: new cr.PhysicalResourceIdReference() },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('certificateDescription.certificateId'),
        outputPaths: ['certificateDescription.certificateArn'],
      },
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

    // --- SSM Parameters ---
    // We store all three cert values in SSM so they are retrievable at any
    // time, not just during the initial deploy. Without this, certPem and
    // privKey are lost after the first deploy since AWS never returns the
    // private key again. The CfnOutputs below would show empty strings on
    // any subsequent update — SSM fixes that.
    //
    // All three use StringParameter (not SecureString) for simplicity.
    // For a production system you would use SecureString with KMS for
    // privKey at minimum, but that requires a custom resource since CDK
    // does not support SecureString natively.
    //
    // Standard tier parameters are free — no storage or API call costs.

    new ssm.StringParameter(this, 'CertArnParam', {
      parameterName: `/sensiq/${thingNameSpecific}/certificateArn`,
      stringValue: createCert.getResponseField('certificateArn'),
      description: `IoT certificate ARN for ${thingNameSpecific}`,
    });

    new ssm.StringParameter(this, 'CertPemParam', {
      parameterName: `/sensiq/${thingNameSpecific}/certificatePem`,
      stringValue: createCert.getResponseField('certificatePem'),
      description: `IoT certificate PEM for ${thingNameSpecific}`,
    });

    new ssm.StringParameter(this, 'PrivKeyParam', {
      parameterName: `/sensiq/${thingNameSpecific}/privateKey`,
      stringValue: createCert.getResponseField('keyPair.PrivateKey'),
      description: `IoT private key for ${thingNameSpecific}`,
    });

    const certArn = createCert.getResponseField('certificateArn');

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    const policy = new iot.CfnPolicy(this, 'SensiqESP32Policy', {
      policyName: 'Sensiq_ESP32_Mqtt_Policy',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'iot:Connect',
            Resource: `arn:aws:iot:${region}:${account}:client/${thingNameGeneral}*`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/data`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Subscribe',
            Resource: `arn:aws:iot:${region}:${account}:topicfilter/sensiq/${thingNameGeneral}*/data`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Receive',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/data`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/test`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Subscribe',
            Resource: `arn:aws:iot:${region}:${account}:topicfilter/sensiq/${thingNameGeneral}*/test`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Receive',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/test`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Subscribe',
            Resource: `arn:aws:iot:${region}:${account}:topicfilter/sensiq/${thingNameGeneral}*/commands`,
          },
          {
            Effect: 'Allow',
            Action: 'iot:Receive',
            Resource: `arn:aws:iot:${region}:${account}:topic/sensiq/${thingNameGeneral}*/commands`,
          },
        ],
      },
    });

    new iot.CfnPolicyPrincipalAttachment(this, 'PolicyAttach', {
      policyName: policy.policyName!,
      principal: certArn,
    });

    const thingAttach = new iot.CfnThingPrincipalAttachment(this, 'ThingAttach', {
      thingName: thing.ref,
      principal: certArn,
    });
    thingAttach.addDependency(thing);

    new cdk.CfnOutput(this, 'CertPemSsmPath', {
      value: `/sensiq/${thingNameSpecific}/certificatePem`,
      description: 'Retrieve with: aws ssm get-parameter --name /sensiq/esp32-lab-001/certificatePem --query Parameter.Value --output text',
    });
    new cdk.CfnOutput(this, 'PrivKeySsmPath', {
      value: `/sensiq/${thingNameSpecific}/privateKey`,
      description: 'Retrieve with: aws ssm get-parameter --name /sensiq/esp32-lab-001/privateKey --query Parameter.Value --output text',
    });
  }
}