import { CfnOutput } from 'aws-cdk-lib';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { BackendAlb } from './alb';
import { BackendImages } from './images';
import { DigiKeySecret } from './digikey';
import { FargateBackend } from './fargate';
import { PartsStorage } from './parts-storage';

export interface BackendProps {
  digikeyClientId?: string;
  digikeyClientSecret?: string;
  bomBucketName?: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoRegion?: string;
}

/** Rust backend: parser + enrichment + tariff + gateway on ECS Fargate behind an ALB. */
export class Backend extends Construct {
  readonly gatewayUrl: string;
  readonly taskRole: IRole;
  readonly partsStorage: PartsStorage;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);

    const vpc = Vpc.fromLookup(this, 'Vpc', { isDefault: true });

    const digikeySecret = new DigiKeySecret(this, 'DigiKeySecret', {
      clientId: props.digikeyClientId,
      clientSecret: props.digikeyClientSecret,
    });

    this.partsStorage = new PartsStorage(this, 'PartsStorage');

    const images = new BackendImages(this, 'Images');

    const fargate = new FargateBackend(this, 'Fargate', {
      vpc,
      images,
      digikeySecret: digikeySecret.secret,
      partsTableName: this.partsStorage.partsTable.tableName,
      unresolvedTableName: this.partsStorage.unresolvedTable.tableName,
      bomBucketName: props.bomBucketName,
      cognitoUserPoolId: props.cognitoUserPoolId,
      cognitoClientId: props.cognitoClientId,
      cognitoRegion: props.cognitoRegion,
    });

    this.taskRole = fargate.taskRole;
    this.partsStorage.grantReadWrite(fargate.taskRole);

    const secretResource = digikeySecret.secret.node.defaultChild;
    if (secretResource) {
      fargate.service.node.addDependency(secretResource);
    }

    const alb = new BackendAlb(this, 'Alb', {
      vpc,
      service: fargate.service,
    });

    this.gatewayUrl = alb.gatewayUrl;

    new CfnOutput(this, 'GatewayUrl', {
      value: this.gatewayUrl,
      description: 'Backend gateway URL (GATEWAY_URL on Amplify)',
      exportName: 'ProkuroGatewayUrl',
    });

    new CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS name',
    });

    new CfnOutput(this, 'ClusterName', {
      value: fargate.cluster.clusterName,
      description: 'ECS cluster name',
    });
  }
}
