import {
  App,
  ISourceCodeProvider,
  Platform,
  SourceCodeProviderConfig,
} from '@aws-cdk/aws-amplify-alpha';
import { CfnOutput, RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_SECRET_NAME,
  PRODUCTION_BRANCH,
} from '../config';

class GitHubAppSourceCodeProvider implements ISourceCodeProvider {
  constructor(
    private readonly owner: string,
    private readonly repository: string,
    private readonly accessToken: SecretValue,
  ) {}

  bind(_app: App): SourceCodeProviderConfig {
    return {
      repository: `https://github.com/${this.owner}/${this.repository}`,
      accessToken: this.accessToken,
    };
  }
}

export interface AmplifyWebProps {
  gatewayUrl?: string;
  githubToken?: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoRegion?: string;
}

/** prokuroWeb on AWS Amplify Hosting (SSR / WEB_COMPUTE). */
export class AmplifyWeb extends Construct {
  readonly appId: string;
  readonly defaultUrl: string;

  constructor(scope: Construct, id: string, props: AmplifyWebProps) {
    super(scope, id);

    const githubToken = props.githubToken;
    const githubTokenSecret = githubToken
      ? new Secret(this, 'GitHubToken', {
          secretName: GITHUB_SECRET_NAME,
          description: 'GitHub PAT for Amplify to access prokuroWeb',
          removalPolicy: RemovalPolicy.DESTROY,
          secretStringValue: SecretValue.unsafePlainText(githubToken),
        })
      : Secret.fromSecretNameV2(
          this,
          'GitHubToken',
          GITHUB_SECRET_NAME,
        );

    const accessToken = githubToken
      ? SecretValue.unsafePlainText(githubToken)
      : githubTokenSecret.secretValue;

    const amplifyApp = new App(this, 'App', {
      appName: 'prokuro-web',
      sourceCodeProvider: new GitHubAppSourceCodeProvider(
        GITHUB_OWNER,
        GITHUB_REPO,
        accessToken,
      ),
      platform: Platform.WEB_COMPUTE,
    });

    if (githubToken) {
      amplifyApp.node.addDependency(githubTokenSecret);
    }

    const branchEnv: Record<string, string> = {};
    if (props.gatewayUrl) {
      branchEnv.GATEWAY_URL = props.gatewayUrl;
      branchEnv.NEXT_PUBLIC_GATEWAY_URL = props.gatewayUrl;
    }
    if (props.cognitoUserPoolId) {
      branchEnv.NEXT_PUBLIC_COGNITO_USER_POOL_ID = props.cognitoUserPoolId;
    }
    if (props.cognitoClientId) {
      branchEnv.NEXT_PUBLIC_COGNITO_CLIENT_ID = props.cognitoClientId;
    }
    if (props.cognitoRegion) {
      branchEnv.NEXT_PUBLIC_COGNITO_REGION = props.cognitoRegion;
    }

    const productionBranch = amplifyApp.addBranch(PRODUCTION_BRANCH, {
      autoBuild: true,
      stage: 'PRODUCTION',
      environmentVariables:
        Object.keys(branchEnv).length > 0 ? branchEnv : undefined,
    });

    this.appId = amplifyApp.appId;
    this.defaultUrl = `https://${PRODUCTION_BRANCH}.${amplifyApp.appId}.amplifyapp.com`;

    new CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.appId,
      description: 'Amplify app ID',
    });

    new CfnOutput(this, 'AmplifyDefaultUrl', {
      value: this.defaultUrl,
      description: 'Amplify URL (no custom domain required)',
    });
  }
}
