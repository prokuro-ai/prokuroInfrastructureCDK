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
<div style="margin:0;padding:20px;background:#f2f2f2;font-family:Arial,sans-serif;color:#0f1b2d">
  <div style="max-width:600px;margin:0 auto;background:#ffffff">
    <div style="padding:36px 48px 52px;text-align:center">
      <table role="presentation" cellpadding="0" cellspacing="0" align="center">
        <tr>
          <td width="34" valign="middle">
            <img src="${WEB_BASE_URL}/prokuro-mark.png" width="24" height="24" alt="Prokuro" style="display:block;border:0">
          </td>
          <td valign="middle">
            <strong style="font-size:26px;line-height:30px">Prokuro<span style="color:#0062ff">.ai</span></strong>
          </td>
        </tr>
      </table>
    </div>
    <div style="padding:24px 48px 56px">
      <h1 style="margin:0 0 34px;font-size:24px;line-height:1.3">Account Verification Code</h1>
      <p style="margin:0 0 38px;font-size:18px;line-height:1.5;color:#26384a">
        Continue to your Prokuro account by entering the verification code below. The code will expire soon.
      </p>
      <div style="margin:0 0 54px;font-size:32px;line-height:1.2">
        <strong>{####}</strong>
      </div>
      <p style="margin:0;font-size:16px;line-height:1.5;color:#26384a">
        If you did not request this code, ignore this email. Do not share it with anyone.
      </p>
    </div>
    <div style="margin:0 48px;padding:28px 0 36px;border-top:2px solid #98a3b6;text-align:center;font-size:12px;line-height:1.7;color:#7a8598">
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin-bottom:14px">
        <tr>
          <td width="25" valign="middle">
            <img src="${WEB_BASE_URL}/prokuro-mark.png" width="17" height="17" alt="" style="display:block;border:0">
          </td>
          <td valign="middle">
            <strong style="font-size:18px;line-height:22px;color:#0f1b2d">Prokuro<span style="color:#0062ff">.ai</span></strong>
          </td>
        </tr>
      </table>
      525 Market Street, 2nd Floor, San Francisco, CA 94105<br>
      &copy; 2026 Prokuro, Inc. All rights reserved.
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
