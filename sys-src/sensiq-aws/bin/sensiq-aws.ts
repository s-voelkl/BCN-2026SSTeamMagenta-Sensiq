#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotDeviceStack } from '../infra/sensiq-iot-device-stack';
import { IotCoreStack } from '../infra/sensiq-iot-stack';
import { SensiqAthenaStack } from '../infra/sensiq-athena-stack';
import { SensiqApiStack } from '../infra/sensiq-api-stack';

const app = new cdk.App();

const deviceStack = new SensiqIotDeviceStack(app, 'SensiqIotDeviceStack');

const athenaStack = new SensiqAthenaStack(app, 'SensiqAthenaStack');

const iotCoreStack = new IotCoreStack(app, 'SensiqIotCoreStack', { athenaStack });

const apiStack = new SensiqApiStack(app, 'SensiqApiStack');

iotCoreStack.addDependency(deviceStack);
apiStack.addDependency(athenaStack);
