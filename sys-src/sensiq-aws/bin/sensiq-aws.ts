#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotDeviceStack } from '../infra/sensiq-iot-device-stack';
import { IotCoreStack } from '../infra/sensiq-iot-stack';
import { SensiqAthenaStack } from '../infra/sensiq-athena-stack';

const app = new cdk.App();

const deviceStack = new SensiqIotDeviceStack(app, 'SensiqIotDeviceStack');

const iotCoreStack = new IotCoreStack(app, 'SensiqIotCoreStack');

const athenaStack = new SensiqAthenaStack(app, 'SensiqAthenaStack'); // eslint-disable-line

iotCoreStack.addDependency(deviceStack);