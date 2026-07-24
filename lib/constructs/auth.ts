import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPool,
  Mfa,
  OAuthScope,
  ProviderAttribute,
  StringAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolIdentityProviderGoogle,
} from 'aws-cdk-lib/aws-cognito';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import {
  COGNITO_DOMAIN_PREFIX,
  GOOGLE_OAUTH_SECRET_NAME,
  WEB_BASE_URL,
} from '../config';

export class CognitoAuth extends Construct {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly domainName: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    new EmailIdentity(this, 'SenderEmailIdentity', {
      identity: Identity.email('noreply@prokuro.ai'),
    });

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
      signInPolicy: {
        allowedFirstAuthFactors: { password: true, emailOtp: true },
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OFF,
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    const cfnUserPool = this.userPool.node.defaultChild as CfnUserPool;
    cfnUserPool.usernameConfiguration = { caseSensitive: false };

    const googleOAuthSecret = Secret.fromSecretNameV2(
      this,
      'GoogleOAuthSecret',
      GOOGLE_OAUTH_SECRET_NAME,
    );
    const googleProvider = new UserPoolIdentityProviderGoogle(
      this,
      'GoogleIdentityProvider',
      {
        userPool: this.userPool,
        clientId: googleOAuthSecret
          .secretValueFromJson('client_id')
          .unsafeUnwrap(),
        clientSecretValue:
          googleOAuthSecret.secretValueFromJson('client_secret'),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: ProviderAttribute.GOOGLE_EMAIL,
          emailVerified: ProviderAttribute.GOOGLE_EMAIL_VERIFIED,
          givenName: ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      },
    );

    const domain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: COGNITO_DOMAIN_PREFIX },
    });
    this.domainName = `${domain.domainName}.auth.${Stack.of(this).region}.amazoncognito.com`;

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'prokuro-web',
      // The existing passwordless email flow uses USER_AUTH with EMAIL_OTP.
      authFlows: { user: true, userPassword: true, userSrp: true },
      generateSecret: false,
      supportedIdentityProviders: [
        UserPoolClientIdentityProvider.COGNITO,
        UserPoolClientIdentityProvider.GOOGLE,
      ],
      oAuth: {
        callbackUrls: [
          `${WEB_BASE_URL}/auth/callback`,
          'http://localhost:3010/auth/callback',
        ],
        logoutUrls: [`${WEB_BASE_URL}/`, 'http://localhost:3010/'],
        flows: { authorizationCodeGrant: true },
        scopes: [
          OAuthScope.OPENID,
          OAuthScope.EMAIL,
          OAuthScope.PROFILE,
          OAuthScope.COGNITO_ADMIN,
        ],
      },
    });
    this.userPoolClient.node.addDependency(googleProvider);

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

    new CfnOutput(this, 'GoogleOAuthRedirectUri', {
      value: `https://${this.domainName}/oauth2/idpresponse`,
      description: 'Authorized redirect URI for the Google OAuth client',
    });
  }
}
