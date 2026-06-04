#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotDeviceStack } from '../infra/sensiq-iot-device-stack';
import { SensiqLiveStack } from '../infra/sensiq-live-stack';
import { SensiqHistoryStack } from '../infra/sensiq-history-stack';
import { SensiqApiStack } from '../infra/sensiq-api-stack';

const app = new cdk.App();

const deviceStack = new SensiqIotDeviceStack(app, 'SensiqIotDeviceStack');

const historyStack = new SensiqHistoryStack(app, 'SensiqHistoryStack'); // eslint-disable-line

const liveStack = new SensiqLiveStack(app, 'SensiqLiveStack');

const apiStack = new SensiqApiStack(app, 'SensiqApiStack');

liveStack.addDependency(deviceStack);
apiStack.addDependency(liveStack);
apiStack.addDependency(historyStack);
