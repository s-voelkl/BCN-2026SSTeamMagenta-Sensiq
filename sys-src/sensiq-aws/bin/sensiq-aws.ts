#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotDeviceStack } from '../lib/sensiq-iot-device-stack';
import { IotCoreStack } from '../lib/sensiq-iot-stack';
import { SensiqAthenaStack } from '../lib/sensiq-athena-stack';

const app = new cdk.App();

const deviceStack = new SensiqIotDeviceStack(app, 'SensiqIotDeviceStack');

const iotCoreStack = new IotCoreStack(app, 'SensiqIotCoreStack');

const athenaStack = new SensiqAthenaStack(app, 'SensiqAthenaStack'); // eslint-disable-line

iotCoreStack.addDependency(deviceStack);