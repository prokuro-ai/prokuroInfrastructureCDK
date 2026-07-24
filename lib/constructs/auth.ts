import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPool,
  CfnUserPoolClient,
  Mfa,
  StringAttribute,
  UserPool,
  UserPoolClient,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class CognitoAuth extends Construct {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly userPoolId: string;
  readonly userPoolClientId: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: 'prokuro-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      customAttributes: {
        company: new StringAttribute({ mutable: true }),
      },
      passwordPolicy: { minLength: 8 },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OFF,
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    const cfnUserPool = this.userPool.node.defaultChild as CfnUserPool;
    cfnUserPool.usernameConfiguration = { caseSensitive: false };
    cfnUserPool.addPropertyOverride('Policies.SignInPolicy', {
      AllowedFirstAuthFactors: ['PASSWORD', 'EMAIL_OTP'],
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'prokuro-web',
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    const cfnClient = this.userPoolClient.node.defaultChild as CfnUserPoolClient;
    cfnClient.explicitAuthFlows = [
      'ALLOW_REFRESH_TOKEN_AUTH',
      'ALLOW_USER_AUTH',
      'ALLOW_USER_PASSWORD_AUTH',
      'ALLOW_USER_SRP_AUTH',
    ];

    this.userPoolId = this.userPool.userPoolId;
    this.userPoolClientId = this.userPoolClient.userPoolClientId;

    new CfnOutput(this, 'CognitoUserPoolId', {
      value: this.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'ProkuroCognitoUserPoolId',
    });

    new CfnOutput(this, 'CognitoClientId', {
      value: this.userPoolClientId,
      description: 'Cognito app client ID',
      exportName: 'ProkuroCognitoClientId',
    });
  }
}
