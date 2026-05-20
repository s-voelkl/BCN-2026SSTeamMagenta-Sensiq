# Usage Instructions

## AWS

### AWS CLI

AWS CLI install (+admin)
aws --version

### AWS Roles

AWS IAM Role <https://eu-central-1.console.aws.amazon.com/console/home?region=eu-central-1>
WSL start
aws configure (key)
Region: eu-central-1

### AWS CDK

npm update if needed
aws-install -g aws-cdk
cdk --version

## AWS dependency installation

yarn -v (1.22.22)
yarn install (in sensiq-aws folder)

## AWS Account Bootsrap

If you are using a new aws account, you first need to bootstrap

cdk bootstrap aws://<"account-id">/<"region">

## AWS deployment

cdk synth (builds the cloudformation template -> viewable in cdk.out)
cdk diff (compares stacks with deployed stacks)
cdk deploy (deploys application using your local aws cli config)
    DO NOT DEPLOY TO THE DEVELOPMENT ACCOUNT!

Automatic Deployment on Pull Request using GitHub Actions

### Local Development

Local development on personal account.
Manual run of the workflow dispatch with github actions.

## Hardware

The MCU with sensors is needed for the local development.
The config file needs to be adjusted in order to run the hardware unit and connect via MQTT to the AWS cloud.

## Frontend

tbd
