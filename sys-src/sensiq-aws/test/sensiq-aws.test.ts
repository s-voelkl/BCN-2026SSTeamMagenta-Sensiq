// import * as cdk from 'aws-cdk-lib/core';

test('App entrypoint loads and creates stacks without errors', () => {
    // Executing the bin file tests if the app constructs the stacks and their dependencies correctly
    expect(() => {
        require('../bin/sensiq-aws.ts'); // eslint-disable-line
    }).not.toThrow();
});
