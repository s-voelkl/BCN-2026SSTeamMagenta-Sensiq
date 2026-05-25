#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotDeviceStack } from '../lib/sensiq-iot-device-stack';
import { IotCoreStack } from '../lib/sensiq-iot-stack';
import { SensiqExampleStack } from '../lib/sensiq-example-stack';

const app = new cdk.App();

const deviceStack = new SensiqIotDeviceStack(app, 'SensiqIotDeviceStack');

const iotCoreStack = new IotCoreStack(app, 'SensiqIotCoreStack');

const exampleStack = new SensiqExampleStack(app, 'SensiqExampleStack');

iotCoreStack.addDependency(deviceStack);