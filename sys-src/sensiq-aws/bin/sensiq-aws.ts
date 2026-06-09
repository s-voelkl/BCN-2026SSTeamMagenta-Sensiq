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

// Live and history handlers are passed in from their domain stacks so each
// Lambda keeps the permissions configured next to its data source.
const apiStack = new SensiqApiStack(app, 'SensiqApiStack', {
    liveFunction: liveStack.lambdaHandleLiveData,
    historyFunction: historyStack.lambdaHandleHistoryData,
});

liveStack.addDependency(deviceStack);
apiStack.addDependency(liveStack);
apiStack.addDependency(historyStack);
