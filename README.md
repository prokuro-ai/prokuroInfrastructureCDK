# prokuroInfrastructureCDK

AWS CDK for Prokuro — one stack (`Prokuro`): Rust backend on ECS Fargate + prokuroWeb on Amplify.

## Prerequisites

- AWS CLI (`prokuro` profile), Node.js 22+, Docker Desktop
- [Amplify GitHub App](https://github.com/apps/aws-amplify-us-west-2) on `prokuro-ai/prokuroWeb`
- GitHub PAT (`repo` scope) and Nexar credentials — first deploy only

## Deploy

```bash
cd prokuroInfrastructureCDK
npm install
cp .env.example .env   # fill in secrets for first deploy
export AWS_PROFILE=prokuro
npm run build
npx cdk bootstrap aws://713463138528/us-west-2   # once
npx cdk deploy Prokuro
```

First deploy builds three backend Docker images — allow 10–20 minutes.

**`.env`:** `GITHUB_TOKEN` and `NEXAR_*` only needed on first deploy (creates Secrets Manager entries). `DOMAIN_NAME` optional for custom domain.

**Outputs:** `GatewayUrl` (wired to Amplify as `GATEWAY_URL`), `AmplifyDefaultUrl` (frontend).
