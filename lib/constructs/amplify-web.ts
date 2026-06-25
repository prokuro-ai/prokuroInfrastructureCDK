import {
  App,
  ISourceCodeProvider,
  Platform,
  SourceCodeProviderConfig,
} from '@aws-cdk/aws-amplify-alpha';
import { CfnDomain } from 'aws-cdk-lib/aws-amplify';
import { CfnOutput, SecretValue } from 'aws-cdk-lib';
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
  domainName?: string;
  githubToken?: string;
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
    }

    const productionBranch = amplifyApp.addBranch(PRODUCTION_BRANCH, {
      autoBuild: true,
      stage: 'PRODUCTION',
      environmentVariables:
        Object.keys(branchEnv).length > 0 ? branchEnv : undefined,
    });

    this.appId = amplifyApp.appId;
    this.defaultUrl = `https://${PRODUCTION_BRANCH}.${amplifyApp.appId}.amplifyapp.com`;

    const domainName = props.domainName;
    if (domainName) {
      const domain = new CfnDomain(this, 'Domain', {
        appId: amplifyApp.appId,
        domainName,
        subDomainSettings: [
          { branchName: PRODUCTION_BRANCH, prefix: '' },
          { branchName: PRODUCTION_BRANCH, prefix: 'www' },
        ],
      });
      domain.node.addDependency(productionBranch);

      new CfnOutput(this, 'CustomDomain', {
        value: `https://${domainName}`,
        description: 'Production URL after DNS is updated',
      });
    }

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
