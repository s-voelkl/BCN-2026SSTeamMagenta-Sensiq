#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SensiqIotStack } from '../lib/sensiq-iot-stack';

const app = new cdk.App();
new SensiqIotStack(app, 'SensiqIotStack');
