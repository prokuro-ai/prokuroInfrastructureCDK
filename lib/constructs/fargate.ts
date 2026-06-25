import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  Cluster,
  ContainerDependencyCondition,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
  Secret,
} from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { BackendImages } from './images';

export interface FargateBackendProps {
  vpc: IVpc;
  images: BackendImages;
  nexarSecret: ISecret;
}

/**
 * ECS cluster + single Fargate task (gateway, parser, enrichment containers).
 * Containers communicate via localhost inside the task. Same as docker-compose.
 */
export class FargateBackend extends Construct {
  readonly cluster: Cluster;
  readonly service: FargateService;

  constructor(scope: Construct, id: string, props: FargateBackendProps) {
    super(scope, id);

    this.cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: 'prokuro-backend',
    });

    const taskDefinition = new FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
    });

    taskDefinition.addToExecutionRolePolicy(
      new PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.nexarSecret.secretArn],
      }),
    );

    const logDriverFor = (containerName: string) =>
      LogDrivers.awsLogs({
        streamPrefix: containerName,
        logGroup: new LogGroup(this, `${containerName}LogGroup`, {
          logGroupName: `/prokuro/backend/${containerName}`,
          retention: RetentionDays.ONE_DAY,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      });

    const parserContainer = taskDefinition.addContainer('parser', {
      containerName: 'parser',
      image: ContainerImage.fromDockerImageAsset(props.images.parser),
      essential: true,
      portMappings: [{ containerPort: 3001 }],
      environment: { PORT: '3001' },
      logging: logDriverFor('parser'),
    });

    const enrichmentContainer = taskDefinition.addContainer('enrichment', {
      containerName: 'enrichment',
      image: ContainerImage.fromDockerImageAsset(props.images.enrichment),
      essential: true,
      portMappings: [{ containerPort: 3002 }],
      environment: { PORT: '3002' },
      secrets: {
        NEXAR_CLIENT_ID: Secret.fromSecretsManager(
          props.nexarSecret,
          'NEXAR_CLIENT_ID',
        ),
        NEXAR_CLIENT_SECRET: Secret.fromSecretsManager(
          props.nexarSecret,
          'NEXAR_CLIENT_SECRET',
        ),
      },
      logging: logDriverFor('enrichment'),
    });

    const gatewayContainer = taskDefinition.addContainer('gateway', {
      containerName: 'gateway',
      image: ContainerImage.fromDockerImageAsset(props.images.gateway),
      essential: true,
      portMappings: [{ containerPort: 3000 }],
      environment: {
        PORT: '3000',
        PARSER_URL: 'http://127.0.0.1:3001',
        ENRICHMENT_URL: 'http://127.0.0.1:3002',
      },
      logging: logDriverFor('gateway'),
    });

    gatewayContainer.addContainerDependencies(
      {
        container: parserContainer,
        condition: ContainerDependencyCondition.START,
      },
      {
        container: enrichmentContainer,
        condition: ContainerDependencyCondition.START,
      },
    );

    this.service = new FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      serviceName: 'prokuro-backend',
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
    });
  }
}
