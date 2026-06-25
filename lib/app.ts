import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { loadConfig, ProkuroConfig } from './config';
import { AmplifyWeb } from './constructs/amplify-web';
import { Backend } from './constructs/backend';
import { CognitoAuth } from './constructs/cognito-auth';

export interface ProkuroStackProps extends StackProps {
  /** Override env-based config */
  config?: ProkuroConfig;
}

/**
 * Single deployable unit for all Prokuro AWS infrastructure:
 * Rust backend (ECS) + prokuroWeb (Amplify). An internet-facing ALB is used to expose the gateway service 
 * for serving the web app.
 */
export class ProkuroStack extends Stack {
  readonly gatewayUrl: string;
  readonly amplifyUrl: string;

  constructor(scope: Construct, id: string, props?: ProkuroStackProps) {
    super(scope, id, props);

    const config = props?.config ?? loadConfig();

    const backend = new Backend(this, 'Backend', {
      nexarClientId: config.nexarClientId,
      nexarClientSecret: config.nexarClientSecret,
    });

    const cognito = new CognitoAuth(this, 'Auth');

    const web = new AmplifyWeb(this, 'Web', {
      gatewayUrl: backend.gatewayUrl,
      domainName: config.domainName,
      githubToken: config.githubToken,
      cognitoUserPoolId: cognito.userPoolId,
      cognitoClientId: cognito.userPoolClientId,
      cognitoRegion: this.region,
    });

    this.gatewayUrl = backend.gatewayUrl;
    this.amplifyUrl = web.defaultUrl;

    new CfnOutput(this, 'ProkuroSummary', {
      value: `gateway=${backend.gatewayUrl} web=${web.defaultUrl}`,
      description: 'Quick reference — gateway and Amplify URLs',
    });
  }
}
