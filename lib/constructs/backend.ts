import { CfnOutput } from 'aws-cdk-lib';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { BackendAlb } from './alb';
import { BackendImages } from './images';
import { FargateBackend } from './fargate';
import { NexarSecret } from './nexar';

export interface BackendProps {
  nexarClientId?: string;
  nexarClientSecret?: string;
  bomBucketName?: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoRegion?: string;
}

/** Rust backend: parser + enrichment + gateway + ... on ECS Fargate behind an ALB. */
export class Backend extends Construct {
  readonly gatewayUrl: string;
  readonly taskRole: IRole;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);

    const vpc = Vpc.fromLookup(this, 'Vpc', { isDefault: true });

    const nexarSecret = new NexarSecret(this, 'NexarSecret', {
      clientId: props.nexarClientId,
      clientSecret: props.nexarClientSecret,
    });

    const images = new BackendImages(this, 'Images');

    const fargate = new FargateBackend(this, 'Fargate', {
      vpc,
      images,
      nexarSecret: nexarSecret.secret,
      bomBucketName: props.bomBucketName,
      cognitoUserPoolId: props.cognitoUserPoolId,
      cognitoClientId: props.cognitoClientId,
      cognitoRegion: props.cognitoRegion,
    });

    this.taskRole = fargate.taskRole;

    const secretResource = nexarSecret.secret.node.defaultChild;
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
