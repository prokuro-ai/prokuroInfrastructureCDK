import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { BACKEND_DIR } from '../config';

/**
 * ECS container images for the Rust backend (parser, enrichment, gateway).
 *
 * ## Current: DockerImageAsset (local build at deploy time)
 *
 * `cdk deploy` builds images from `BACKEND_DIR` on the machine running CDK,
 * pushes them to a CDK-managed ECR staging repo, and wires ECS to those URIs.
 * AWS never sees the source path — only the resulting images.
 *
 * Best fit now: solo dev, first deploy, no backend CI yet. Trade-offs: slow
 * first deploy, requires sibling `prokuroBackend` checkout.
 *
 * ## Future: pre-built images in ECR (CI owns the build)
 *
 * When `prokuroBackend` has its own pipeline (e.g. GitHub Actions on push to
 * main), build and push images there instead:
 *
 *   prokuroBackend CI → docker build → push to ECR (e.g. prokuro/parser:1.2.3)
 *   cdk deploy          → only references image tags, no local source tree
 *
 * Migration sketch — replace this construct with ECR lookups and swap
 * `ContainerImage.fromDockerImageAsset` in fargate-backend.ts for
 * `ContainerImage.fromEcrRepository(repo, tag)` (or pin by digest for prod).
 *
 * Best fit then: repeatable deploys, faster `cdk deploy`, no filesystem path
 * dependency, versioned rollbacks, multiple deployers / CI-only infra deploys.
 *
 * Optional middle step: CI runs `cargo build --release` and copies binaries into
 * minimal Dockerfiles — same ECR flow, faster image builds than compiling in Docker.
 * 
 * Only reason I'm going with this sloppy approach is to ship out the MVP asap.
 */
export class BackendImages extends Construct {
  readonly parser: DockerImageAsset;
  readonly enrichment: DockerImageAsset;
  readonly gateway: DockerImageAsset;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.parser = new DockerImageAsset(this, 'Parser', {
      directory: BACKEND_DIR,
      file: 'docker/parser.Dockerfile',
    });

    this.enrichment = new DockerImageAsset(this, 'Enrichment', {
      directory: BACKEND_DIR,
      file: 'docker/enrichment.Dockerfile',
    });

    this.gateway = new DockerImageAsset(this, 'Gateway', {
      directory: BACKEND_DIR,
      file: 'docker/gateway.Dockerfile',
    });
  }
}
