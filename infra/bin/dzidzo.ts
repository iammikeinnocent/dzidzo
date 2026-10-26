import { App, type Environment } from 'aws-cdk-lib';
import { ApiStack } from '../src/stacks/api';
import { AuthStack } from '../src/stacks/auth';
import { CicdStack } from '../src/stacks/cicd';
import { DataStack } from '../src/stacks/data';
import { JobsStack } from '../src/stacks/jobs';
import { SiteStack } from '../src/stacks/site';

const app = new App();

const stage = app.node.tryGetContext('stage') ?? 'dev';
const env: Environment = {
  ...(process.env.CDK_DEFAULT_ACCOUNT ? { account: process.env.CDK_DEFAULT_ACCOUNT } : {}),
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const dataStack = new DataStack(app, `dzidzo-${stage}-data`, { env, stage });
const authStack = new AuthStack(app, `dzidzo-${stage}-auth`, { env, stage });
new ApiStack(app, `dzidzo-${stage}-api`, {
  env,
  stage,
  mainTable: dataStack.mainTable,
  userPool: authStack.userPool,
  webClientId: authStack.webClient.userPoolClientId,
});
new JobsStack(app, `dzidzo-${stage}-jobs`, { env, stage, mainTable: dataStack.mainTable });
new SiteStack(app, `dzidzo-${stage}-site`, { env, stage });
new CicdStack(app, `dzidzo-${stage}-cicd`, { env, stage });

app.synth();
