import { RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { DIGIKEY_SECRET_ARN, DIGIKEY_SECRET_NAME } from '../config';

export interface DigiKeySecretProps {
  clientId?: string;
  clientSecret?: string;
}

export class DigiKeySecret extends Construct {
  readonly secret: ISecret;

  constructor(scope: Construct, id: string, props: DigiKeySecretProps) {
    super(scope, id);

    const { clientId, clientSecret } = props;

    if (clientId && clientSecret) {
      this.secret = new Secret(this, 'Secret', {
        secretName: DIGIKEY_SECRET_NAME,
        description: 'Digi-Key API credentials for prokuro-enrichment',
        removalPolicy: RemovalPolicy.DESTROY,
        secretObjectValue: {
          DIGIKEY_CLIENT_ID: SecretValue.unsafePlainText(clientId),
          DIGIKEY_CLIENT_SECRET: SecretValue.unsafePlainText(clientSecret),
        },
      });
      return;
    }

    this.secret = Secret.fromSecretCompleteArn(
      this,
      'Secret',
      DIGIKEY_SECRET_ARN,
    );
  }
}
