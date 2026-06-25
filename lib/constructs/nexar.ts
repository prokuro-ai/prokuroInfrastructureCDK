import { SecretValue } from 'aws-cdk-lib';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { NEXAR_SECRET_NAME } from '../config';

export interface NexarSecretProps {
  clientId?: string;
  clientSecret?: string;
}


export class NexarSecret extends Construct {
  readonly secret: ISecret;

  constructor(scope: Construct, id: string, props: NexarSecretProps) {
    super(scope, id);

    const { clientId, clientSecret } = props;

    if (clientId && clientSecret) {
      this.secret = new Secret(this, 'Secret', {
        secretName: NEXAR_SECRET_NAME,
        description: 'Nexar API credentials for prokuro-enrichment',
        secretObjectValue: {
          NEXAR_CLIENT_ID: SecretValue.unsafePlainText(clientId!),
          NEXAR_CLIENT_SECRET: SecretValue.unsafePlainText(clientSecret!),
        },
      });
      return;
    }

    this.secret = Secret.fromSecretNameV2(this, 'Secret', NEXAR_SECRET_NAME);
  }
}
