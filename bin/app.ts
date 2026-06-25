import dotenv from 'dotenv';
import { resolve } from 'path';
import { App } from 'aws-cdk-lib';
import { ProkuroStack } from '../lib/app';

// Load from project root — reliable when invoked via `npm run deploy` from this package.
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true });

const app = new App();

new ProkuroStack(app, 'Prokuro', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '713463138528',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
  },
});
