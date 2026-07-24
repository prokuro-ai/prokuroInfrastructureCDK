import { Duration } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer, ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface BackendAlbProps {
  vpc: IVpc;
  service: FargateService;
}

export class BackendAlb extends Construct {
  readonly loadBalancer: ApplicationLoadBalancer;
  readonly gatewayUrl: string;

  constructor(scope: Construct, id: string, props: BackendAlbProps) {
    super(scope, id);

    this.loadBalancer = new ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'prokuro-backend',
      idleTimeout: Duration.seconds(180),
    });

    const listener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    listener.addTargets('Gateway', {
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targets: [
        props.service.loadBalancerTarget({
          containerName: 'gateway',
          containerPort: 3000,
        }),
      ],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
        interval: Duration.seconds(30),
      },
      deregistrationDelay: Duration.seconds(30),
    });

    this.gatewayUrl = `http://${this.loadBalancer.loadBalancerDnsName}`;
  }
}
