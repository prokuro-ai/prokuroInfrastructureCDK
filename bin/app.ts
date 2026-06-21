import dotenv from 'dotenv';
import path from 'path';
import { App } from 'aws-cdk-lib';
import { AmplifyApp } from '../lib/amplify-app';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const app = new App();

new AmplifyApp(app, 'AmplifyApp', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '713463138528',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
  },
});
