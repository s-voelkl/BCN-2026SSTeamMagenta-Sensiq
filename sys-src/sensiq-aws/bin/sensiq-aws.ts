#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotDeviceStack } from '../lib/sensiq-iot-device-stack';
import { IotCoreStack } from '../lib/sensiq-iot-stack';

const app = new cdk.App();

const deviceStack = new SensiqIotDeviceStack(app, 'SensiqIotDeviceStack');

const iotCoreStack = new IotCoreStack(app, 'SensiqIotCoreStack');

iotCoreStack.addDependency(deviceStack);