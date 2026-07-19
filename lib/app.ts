import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { loadConfig, ProkuroConfig } from './config';
import { AmplifyWeb } from './constructs/amplify-web';
import { Backend } from './constructs/backend';
import { BomStorage } from './constructs/bom-storage';
import { CognitoAuth } from './constructs/auth';

export interface ProkuroStackProps extends StackProps {
  /** Override env-based config */
  config?: ProkuroConfig;
}

/**
 * Single deployable unit for all Prokuro AWS infrastructure:
 * Rust backend (ECS) + Cognito + prokuroWeb (Amplify).
 */
export class ProkuroStack extends Stack {
  readonly gatewayUrl: string;
  readonly amplifyUrl: string;

  constructor(scope: Construct, id: string, props?: ProkuroStackProps) {
    super(scope, id, props);

    const config = props?.config ?? loadConfig();

    const cognito = new CognitoAuth(this, 'Auth');
    const bomStorage = new BomStorage(this, 'BomStorage');

    const backend = new Backend(this, 'Backend', {
      digikeyClientId: config.digikeyClientId,
      digikeyClientSecret: config.digikeyClientSecret,
      bomBucketName: bomStorage.bucketName,
      cognitoUserPoolId: cognito.userPoolId,
      cognitoClientId: cognito.userPoolClientId,
      cognitoRegion: this.region,
    });

    bomStorage.grantReadWrite(backend.taskRole);

    const web = new AmplifyWeb(this, 'Web', {
      gatewayUrl: backend.gatewayUrl,
      githubToken: config.githubToken,
      cognitoUserPoolId: cognito.userPoolId,
      cognitoClientId: cognito.userPoolClientId,
      cognitoRegion: this.region,
    });

    this.gatewayUrl = backend.gatewayUrl;
    this.amplifyUrl = web.defaultUrl;

    new CfnOutput(this, 'ProkuroSummary', {
      value: `gateway=${backend.gatewayUrl} web=${web.defaultUrl}`,
      description: 'Gateway and Amplify URLs',
    });
  }
}
