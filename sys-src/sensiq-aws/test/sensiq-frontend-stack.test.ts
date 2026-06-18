import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SensiqFrontendStack } from '../infra/sensiq-frontend-stack';

let template: Template;

beforeAll(() => {
    const app = new cdk.App();
    const stack = new SensiqFrontendStack(app, 'TestFrontendStack');
    template = Template.fromStack(stack);
});

test('Stack creates exactly one S3 bucket', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
});

test('Bucket is configured for static website hosting', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
        WebsiteConfiguration: {
            IndexDocument: 'index.html',
            // Fallback also index.html
            ErrorDocument: 'index.html',
        },
    });
});

test('Bucket blocks public ACLs but allows public bucket policies', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
        },
    });
});

test('Bucket policy grants anonymous public read', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
                Match.objectLike({
                    Effect: 'Allow',
                    Action: 's3:GetObject',
                    Principal: { AWS: '*' },
                }),
            ]),
        }),
    });
});

test('Bucket is destroyed on stack deletion', () => {
    template.hasResource('AWS::S3::Bucket', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
    });
});

test('Outputs for bucket name and website URL are created', () => {
    template.hasOutput('BucketName', {
        Value: Match.anyValue(),
    });
    template.hasOutput('WebsiteUrl', {
        Value: Match.anyValue(),
    });
});