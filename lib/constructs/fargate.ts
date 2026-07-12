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
import { PolicyStatement, IRole } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { BackendImages } from './images';

export interface FargateBackendProps {
  vpc: IVpc;
  images: BackendImages;
  nexarSecret: ISecret;
  bomBucketName?: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoRegion?: string;
}

/**
 * ECS cluster + single Fargate task (gateway, parser, enrichment, tariff).
 * Containers communicate via localhost inside the task. Same as docker-compose.
 */
export class FargateBackend extends Construct {
  readonly cluster: Cluster;
  readonly service: FargateService;
  readonly taskRole: IRole;

  constructor(scope: Construct, id: string, props: FargateBackendProps) {
    super(scope, id);

    this.cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: 'prokuro-backend',
    });

    // No per-container cpu/memory reservations — containers share the task pool.
    // 512/1024 was sized for three sidecars; bump memory for a fourth (tariff is light).
    const taskDefinition = new FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 512,
    });

    this.taskRole = taskDefinition.taskRole;

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

    const tariffContainer = taskDefinition.addContainer('tariff', {
      containerName: 'tariff',
      image: ContainerImage.fromDockerImageAsset(props.images.tariff),
      essential: true,
      portMappings: [{ containerPort: 3003 }],
      environment: { PORT: '3003' },
      logging: logDriverFor('tariff'),
    });

    const gatewayEnv: Record<string, string> = {
      PORT: '3000',
      PARSER_URL: 'http://127.0.0.1:3001',
      ENRICHMENT_URL: 'http://127.0.0.1:3002',
      TARIFF_URL: 'http://127.0.0.1:3003',
    };
    if (props.bomBucketName) gatewayEnv.BOM_BUCKET_NAME = props.bomBucketName;
    if (props.cognitoUserPoolId) gatewayEnv.COGNITO_USER_POOL_ID = props.cognitoUserPoolId;
    if (props.cognitoClientId) gatewayEnv.COGNITO_CLIENT_ID = props.cognitoClientId;
    if (props.cognitoRegion) {
      gatewayEnv.COGNITO_REGION = props.cognitoRegion;
      gatewayEnv.AWS_REGION = props.cognitoRegion;
    }

    const gatewayContainer = taskDefinition.addContainer('gateway', {
      containerName: 'gateway',
      image: ContainerImage.fromDockerImageAsset(props.images.gateway),
      essential: true,
      portMappings: [{ containerPort: 3000 }],
      environment: gatewayEnv,
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
      {
        container: tariffContainer,
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
