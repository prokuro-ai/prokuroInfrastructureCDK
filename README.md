# prokuroInfrastructureCDK

AWS CDK for Prokuro — one stack (`Prokuro`): Rust backend on ECS Fargate + Cognito + prokuroWeb on Amplify.

## Prerequisites

- AWS CLI (`prokuro` profile), Node.js 22+, Docker Desktop
- GitHub PAT with `repo` scope for `prokuro-ai/prokuroWeb` (first deploy only)
- Nexar credentials — first backend deploy only

## Deploy

```bash
cd prokuroInfrastructureCDK
npm install
cp .env.example .env   # fill in GITHUB_TOKEN + Nexar secrets for first deploy
export AWS_PROFILE=prokuro
npm run build
npx cdk bootstrap aws://713463138528/us-west-2   # once
npx cdk deploy Prokuro
```

First deploy builds three backend Docker images — allow 10–20 minutes.

**`.env` (first deploy only):**

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Amplify GitHub access → stored in Secrets Manager |
| `NEXAR_CLIENT_ID` / `NEXAR_CLIENT_SECRET` | Backend enrichment → stored in Secrets Manager |
| `DOMAIN_NAME` | Optional custom domain on Amplify |

After the first successful deploy, remove `GITHUB_TOKEN` and `NEXAR_*` from `.env`. CDK reads the existing Secrets Manager entries on subsequent deploys.

CDK creates the Amplify app, connects `prokuro-ai/prokuroWeb` on branch `main`, and wires branch env vars (`GATEWAY_URL`, `NEXT_PUBLIC_COGNITO_*`).

**Delete any manually created Amplify app** before deploying if you created one in the console — CDK will create `prokuro-web`.

## Outputs

`GatewayUrl`, `AmplifyDefaultUrl`, Cognito IDs.
