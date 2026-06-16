import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class SensiqFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Public s3 hosted website -> might want to put a Cloudfront distro infront foe https
    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      websiteIndexDocument: 'index.html',
      // client router should handle the errors -> fallback to the index.html itseglf
      websiteErrorDocument: 'index.html',

      // Grant GetObject Permissions for everyone
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,

      encryption: s3.BucketEncryption.S3_MANAGED,

      // Destroy content,since we reproduce it on deployment
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Outputs for the cd pipeline
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'Target for `aws s3 sync ./dist s3://<this> --delete`',
    });
    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: bucket.bucketWebsiteUrl,
      description: 'Website URL',
    });
  }
}