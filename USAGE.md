# Usage Instructions

## AWS

### AWS CLI Installation

AWS CLI install (+admin)

aws --version

### AWS Roles and Login

AWS IAM Role <https://eu-central-1.console.aws.amazon.com/console/home?region=eu-central-1>

Start Windows Subsystem for Linux ([WSL](https://learn.microsoft.com/en-us/windows/wsl/install)): ``WSL start``

Enable Docker for WSL with [Docker Desktop](https://docs.docker.com/desktop/features/wsl/)

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

``cdk synth`` (builds the cloudformation template -> viewable in cdk.out). This command performs basic validation of your CDK code, runs your CDK app, and generates a CloudFormation template from your CDK stack.

``cdk diff`` (compares stacks with deployed stacks)

    **DO NOT DEPLOY TO THE DEVELOPMENT ACCOUNT!**

``cdk deploy`` (deploys application using your local aws cli config)

``cdk destroy`` (destroy stack on AWS)

More information as a CDK Guide: [AWS CDK Hello World](https://docs.aws.amazon.com/cdk/v2/guide/hello-world.html)

Automatic Deployment *on Pull Request* using GitHub Actions.

### Python Setup

- Recommended Python Version: 3.14
- Install Venv: ``sudo apt install python3.14-venv``
- Environment Creation: ``yarn setup:python`` in ``sensiq/aws`` folder
- Activate Environment: ``source ./src/lambda/.venv/bin/activate`` in a new terminal
- Dependencies: see ``./src/lambda/requirements-dev.txt`` for dev dependencies
- Install dependencies: ``pip install .`` in the activated environment (``yarn setup:python`` does that automatically)

> Recommended VS Code Extensions: Python, Python Environments.

### VS Code Config

Recommended .vscode/settings.json configuration for Python testing and linting, in project root folder!

    ``` json
    {
        "python.testing.pytestArgs": [
            "sys-src/sensiq-aws"
        ],
        "python.testing.unittestEnabled": false,
        "python.testing.pytestEnabled": true,
        "python.analysis.autoImportCompletions": true
    }
    ```

### Local Development

Local development on personal account.
Manual run of the workflow dispatch with github actions.

``yarn lint``: linting with eslint for javascript and ruff for python for ensuring code quality > should throw errors if there are syntax or type errors

> Recommended VS Code Extension: ESLint by Microsoft, Ruff by Astral.
> use ``yarn lint --fix`` to automatically fix linting errors when possible

``yarn run build``: build manually when you want to catch syntax and type errors > "sensq.aws@..., tsc"

``yarn run test``: runs tests with code coverage using Jest for JavaScript and Pytest for Python. Exports results to coverage folder.

> Recommended VS Code Extension: Jest by Orta, Python Test Explorer by Little Fox Team.

### CDK

``cdk list``: list all stacks > "SensiqCdkStack"

``cdk synth``: build cloudformation template

``cdk deploy``: deploy to AWS on personal account
--> visible on [AWS CloudFormation](https://eu-central-1.console.aws.amazon.com/cloudformation/home?region=eu-central-1)

## Hardware

The MCU with sensors is needed for the local development.

When deploying the CDK stack (including the ``SensiqIotDeviceStack``) via ``cdk deploy`` the certificates are saved to
the [AWS Systems Manager Parameter Store](https://eu-central-1.console.aws.amazon.com/systems-manager/parameters/?region=eu-central-1) and can be retrieved from there for the hardware configuration.
The config file ``sys-src/sensiq-hardware/src/config.h`` (see template in the folder above)
needs to be adjusted in order to run the hardware unit and connect via MQTT to the AWS cloud by inserting the generated certificate and private key like the following:

    ``` cpp
    constexpr const char *mqtt_aws_device_cert =
        "-----BEGIN CERTIFICATE-----\n"
        "line 1\n"
        "...\n"
        "line n\n"
        "-----END CERTIFICATE-----\n";
    ```

The AWS Root CA certificate can be found [online at Amazon](https://www.amazontrust.com/repository/AmazonRootCA1.pem).

Run ``aws iot describe-endpoint --endpoint-type iot:Data-ATS`` to get the AWS IoT endpoint for the MQTT connection and insert it into the config file as well. It should look like ``...-ats.iot.eu-central-1.amazonaws.com``.

The hardware units send JSON payloads to AWS with the following structure:

    ```json
    {
    "running_time":131147,
    "timestamp":"2026-06-15T10:45:16Z",
    "device_id":"esp32-lab-001",
    "location":"Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
    "dht_humidity":61.6,
    "dht_temperature":22.6,
    "dht_heat_index":22.52377,
    "flame_analog":1089,
    "flame_digital":false,
    "thermistor_analog":2178,
    "thermistor_digital":false,
    "thermistor_temp":27.95632,
    "bme_heated_up":false,
    "bme_temperature":24.89887,
    "bme_humidity":59.40022,
    "bme_pressure":964.558,
    "bme_altitude":413.5006,
    "bme_voc":97.3798,
    "tsl_lux":167.8,
    "is_outlier":false,
    "collect_training":false
    }
    ```

## Frontend

We are using tailwind as our Design Plugin, in combination with recharts as central dependency to display our data.

Our desired test coverage is >60%

### Dependency Installation

We are using yarnv1 (just like the aws cdk).

``yarn -v`` (1.22.22)

``yarn install`` (in sensiq-frontend folder with ``cd ./sys-src/sensiq-frontend/``)

### Testing

Run ``yarn test`` to run all vitest tests (specified in ``./src/test``)
Or ``yarn test:coverage`` to also get your test coverage

For visual testing run ``yarn dev`` to open a socket on your machine

### Linting

For linting run ``yarn lint``

To automatically fix your linting issues (when possible) run ``yarn lint:fix``

### Docker Containerization

Docker is not needed anymore, as the frontend is deployed on an AWS S3 bucket.
