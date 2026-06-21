import * as amplify from '@aws-cdk/aws-amplify-alpha';
import { CfnDomain } from 'aws-cdk-lib/aws-amplify';
import { CfnOutput, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

const SECRET_NAME = 'prokuro/github/amplify-token';
const GITHUB_OWNER = 'prokuro-ai';
const GITHUB_REPO = 'prokuroWeb';
const PRODUCTION_BRANCH = 'main';

/** GitHub App auth via accessToken — GitHubSourceCodeProvider only supports legacy oauthToken. */
class GitHubAppSourceCodeProvider implements amplify.ISourceCodeProvider {
  constructor(
    private readonly owner: string,
    private readonly repository: string,
    private readonly accessToken: SecretValue,
  ) {}

  bind(_app: amplify.App): amplify.SourceCodeProviderConfig {
    return {
      repository: `https://github.com/${this.owner}/${this.repository}`,
      accessToken: this.accessToken,
    };
  }
}

export class AmplifyApp extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const githubToken = process.env.GITHUB_TOKEN?.trim();
    const githubTokenSecret = githubToken
      ? new secretsmanager.Secret(this, 'AmplifyGitHubToken', {
          secretName: SECRET_NAME,
          description: 'GitHub PAT for Amplify to access prokuroWeb',
          secretStringValue: SecretValue.unsafePlainText(githubToken),
        })
      : secretsmanager.Secret.fromSecretNameV2(
          this,
          'AmplifyGitHubToken',
          SECRET_NAME,
        );

    const accessToken = githubToken
      ? SecretValue.unsafePlainText(githubToken)
      : githubTokenSecret.secretValue;

    const amplifyApp = new amplify.App(this, 'ProkuroWeb', {
      appName: 'prokuro-web',
      sourceCodeProvider: new GitHubAppSourceCodeProvider(
        GITHUB_OWNER,
        GITHUB_REPO,
        accessToken,
      ),
      platform: amplify.Platform.WEB_COMPUTE,
    });

    if (githubToken) {
      amplifyApp.node.addDependency(githubTokenSecret);
    }

    amplifyApp.addBranch(PRODUCTION_BRANCH, {
      autoBuild: true,
      stage: 'PRODUCTION',
    });

    const domainName = process.env.DOMAIN_NAME?.trim();
    if (domainName) {
      new CfnDomain(this, 'ProkuroDomain', {
        appId: amplifyApp.appId,
        domainName,
        subDomainSettings: [
          { branchName: PRODUCTION_BRANCH, prefix: '' },
          { branchName: PRODUCTION_BRANCH, prefix: 'www' },
        ],
      });

      new CfnOutput(this, 'CustomDomain', {
        value: `https://${domainName}`,
        description: 'Production URL after GoDaddy DNS is updated',
      });
    }

    new CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.appId,
      description: 'Amplify app ID',
    });

    new CfnOutput(this, 'AmplifyDefaultUrl', {
      value: `https://${PRODUCTION_BRANCH}.${amplifyApp.appId}.amplifyapp.com`,
      description: 'Staging URL (no custom domain required)',
    });
  }
}
