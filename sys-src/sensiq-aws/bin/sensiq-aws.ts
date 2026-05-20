#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotDeviceStack } from '../lib/sensiq-iot-device-stack';

const app = new cdk.App();
new SensiqIotDeviceStack(app, 'SensiqIotDeviceStack');
