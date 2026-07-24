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
  VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import {
  COGNITO_DOMAIN_PREFIX,
  GOOGLE_OAUTH_SECRET_NAME,
  WEB_BASE_URL,
} from '../config';

const verificationEmailBody = `
<div style="margin:0;padding:40px 16px;background:#f4f6f9;font-family:Arial,sans-serif;color:#0f1b2d">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d6deea">
    <div style="padding:28px 40px;border-bottom:1px solid #d6deea">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="24" valign="middle">
            <div style="width:14px;height:14px;background:#0062ff"></div>
          </td>
          <td valign="middle">
            <strong style="font-size:20px;line-height:24px">Prokuro<span style="color:#0062ff">.ai</span></strong>
          </td>
          <td valign="middle" align="right" style="font-size:13px;color:#7a8598">Account security</td>
        </tr>
      </table>
    </div>
    <div style="padding:48px 40px">
      <h1 style="margin:0 0 20px;font-size:32px;line-height:1.2">Verify your email address</h1>
      <p style="margin:0 0 32px;font-size:17px;line-height:1.6;color:#4f5d73">
        Enter this verification code to finish creating your Prokuro account.
      </p>
      <div style="margin:0 0 32px;padding:24px;text-align:center;background:#eef4ff;border:1px solid #d6deea">
        <strong style="font-family:Arial,sans-serif;font-size:36px;color:#0062ff">{####}</strong>
      </div>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#4f5d73">
        Do not share this code with anyone. If you did not create this account, you can safely ignore this email.
      </p>
    </div>
    <div style="padding:24px 40px;border-top:1px solid #d6deea;background:#f8fafc;font-size:13px;line-height:1.6;color:#7a8598">
      <strong style="color:#4f5d73">Prokuro.ai</strong><br>
      BOM intelligence for hardware teams.<br><br>
      You received this email because an account was created using this address.<br>
      &copy; 2026 Prokuro, Inc.
    </div>
  </div>
</div>`;

export class CognitoAuth extends Construct {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly domainName: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const senderEmailIdentity = new EmailIdentity(
      this,
      'SenderEmailIdentity',
      {
        identity: Identity.email('noreply@prokuro.ai'),
        mailFromDomain: 'mail.prokuro.ai',
      },
    );

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
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
        emailSubject: 'Verify your Prokuro account',
        emailBody: verificationEmailBody,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OFF,
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    const cfnUserPool = this.userPool.node.defaultChild as CfnUserPool;
    cfnUserPool.usernameConfiguration = { caseSensitive: false };
    cfnUserPool.emailConfiguration = {
      emailSendingAccount: 'COGNITO_DEFAULT',
      sourceArn: senderEmailIdentity.emailIdentityArn,
    };

    const senderPolicyName = 'AllowCognitoToSend';
    const senderPolicy = Stack.of(this).toJsonString({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: senderPolicyName,
          Effect: 'Allow',
          Principal: { Service: 'email.cognito-idp.amazonaws.com' },
          Action: ['ses:SendEmail', 'ses:SendRawEmail'],
          Resource: senderEmailIdentity.emailIdentityArn,
          Condition: {
            StringEquals: {
              'aws:SourceAccount': Stack.of(this).account,
            },
            ArnLike: {
              'aws:SourceArn': Stack.of(this).formatArn({
                service: 'cognito-idp',
                resource: 'userpool',
                resourceName: '*',
              }),
            },
          },
        },
      ],
    });
    const senderAuthorizationPolicy = new AwsCustomResource(
      this,
      'SenderAuthorizationPolicy',
      {
        onCreate: {
          service: 'SESv2',
          action: 'createEmailIdentityPolicy',
          parameters: {
            EmailIdentity: senderEmailIdentity.emailIdentityName,
            PolicyName: senderPolicyName,
            Policy: senderPolicy,
          },
          physicalResourceId: PhysicalResourceId.of(senderPolicyName),
        },
        onUpdate: {
          service: 'SESv2',
          action: 'updateEmailIdentityPolicy',
          parameters: {
            EmailIdentity: senderEmailIdentity.emailIdentityName,
            PolicyName: senderPolicyName,
            Policy: senderPolicy,
          },
        },
        onDelete: {
          service: 'SESv2',
          action: 'deleteEmailIdentityPolicy',
          parameters: {
          EmailIdentity: senderEmailIdentity.emailIdentityName,
          PolicyName: senderPolicyName,
        },
        ignoreErrorCodesMatching: 'NotFoundException',
      },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: [senderEmailIdentity.emailIdentityArn],
        }),
        installLatestAwsSdk: false,
      },
    );
    cfnUserPool.node.addDependency(senderAuthorizationPolicy);

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
