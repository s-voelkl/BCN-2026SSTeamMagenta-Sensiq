import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// example resource import
import * as sqs from 'aws-cdk-lib/aws-sqs';

// Import the Lambda module
// import * as lambda from 'aws-cdk-lib/aws-lambda';

export class SensiqExampleStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // example resource
        const queue = new sqs.Queue(this, 'SensiqTestQueue', {
            visibilityTimeout: cdk.Duration.seconds(300)
        });

        // Define the Lambda function resource.
        // arguments: scope, id, properties (with runtime, handler, code)
        // const historyHellowWorldLambda = new lambda.Function(this, "HistoryHelloWorldLambda", {
        //     runtime: lambda.Runtime.NODEJS_20_X, // Provide any supported Node.js runtime
        //     handler: "index.handler",
        //     code: lambda.Code.fromInline(`
        //         exports.handler = async function(event) {
        //             return {
        //                 statusCode: 200,
        //                 body: JSON.stringify('Hello CDK!'),
        //             };
        //         };
        //     `),
        // });

        // Define the Lambda function URL resource.
        // Do not use Auth Type NONE, as it would be publicly accessible without authentication.
        // const historyHelloWorldLambdaUrl = historyHellowWorldLambda.addFunctionUrl({
        //     authType: lambda.FunctionUrlAuthType.NONE,
        // });

        // Define a CloudFormation output for your URL
        // new cdk.CfnOutput(this, "historyHelloWorldLambdaUrlOutput", {
        //     value: historyHelloWorldLambdaUrl.url,
        // })


    }
}