import tseslint from "typescript-eslint";

// single line ignore: 
// <my bad code ...>  // eslint-disable-line

// configuration of the eslint linter for ts
export default tseslint.config(
  {
    ignores: [
      // python stuff
      "node_modules/**",
      "**/.venv/**",
      "src/lambda/**",

      //cdk
      "cdk.out/**",

      //coverage reports
      "coverage/**",

      // cdk generated files
      "bin/sensiq-aws.d.ts,",
      "bin/sensiq-aws.js",
      "lib/sensiq-cdk-stack.d.ts",
      "lib/sensiq-cdk-stack.js",
    ]
  },
  ...tseslint.configs.recommended
);