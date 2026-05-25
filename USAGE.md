# Usage Instructions

## AWS

### AWS CLI Installation

AWS CLI install (+admin)
aws --version

### AWS Roles and Login

AWS IAM Role <https://eu-central-1.console.aws.amazon.com/console/home?region=eu-central-1>
Start Windows Subsystem for Linux ([WSL](https://learn.microsoft.com/en-us/windows/wsl/install)): ``WSL start``
Login with Key: ``aws configure (key)``
Recommended Login: ``aws login --remote`` -> login with browser (may need to configure region first)
Region: eu-central-1

### AWS CDK Installation

``npm update`` if needed
``aws-install -g aws-cdk`` maybe with sudo
``cdk --version``

## AWS dependency Installation

``yarn -v`` (1.22.22)
``yarn install`` (in sensiq-aws folder with ``cd ./sys-src/sensiq-aws/``)

## AWS Account Bootstrap

If you are using a new aws account, you first need to bootstrap

cdk bootstrap aws://<"account-id">/<"region">

## AWS deployment

``cdk synth`` (builds the cloudformation template -> viewable in cdk.out)
``cdk diff`` (compares stacks with deployed stacks)
``cdk deploy`` (deploys application using your local aws cli config)
    **DO NOT DEPLOY TO THE DEVELOPMENT ACCOUNT!**

Automatic Deployment *on Pull Request* using GitHub Actions

### Local Development

Local development on personal account.
Manual run of the workflow dispatch with github actions.

## Hardware

The MCU with sensors is needed for the local development.
The config file ``sys-src/sensiq-hardware/src/config.h`` (see template in the folder above) 
needs to be adjusted in order to run the hardware unit and connect via MQTT to the AWS cloud.

## Frontend

tbd
