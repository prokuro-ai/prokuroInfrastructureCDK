# prokuroInfrastructureCDK

AWS CDK infrastructure for Prokuro.

## Landing page (Amplify)

Hosts [prokuroWeb](https://github.com/prokuro-ai/prokuroWeb) on AWS Amplify.

### Prerequisites

- AWS CLI with `prokuro` profile (`aws login --profile prokuro`)
- Node.js 22+ and npm (installed via [nvm](https://github.com/nvm-sh/nvm) — reload your terminal or run `source ~/.zshrc`)
- [Amplify GitHub App](https://github.com/apps/aws-amplify-us-west-2) installed with access to `prokuro-ai/prokuroWeb`
- GitHub classic PAT with `repo` scope (or `admin:repo_hook` per [AWS docs](https://docs.aws.amazon.com/amplify/latest/userguide/setting-up-GitHub-access.html))

### Setup

```bash
cd prokuroInfrastructureCDK
npm install
cp .env.example .env
# Edit .env — set GITHUB_TOKEN (required for first deploy only)
```

CDK is a **local** dependency — use `npx cdk` or `npm run synth`, not a global `cdk` install.

### Deploy

```bash
export AWS_PROFILE=prokuro
aws login --profile prokuro   # if session expired
npm run clean
npm run build
npx cdk bootstrap aws://713463138528/us-west-2   # once
npx cdk deploy
```

Keep `GITHUB_TOKEN` in `.env` for the **first deploy only** — CDK creates the Secrets Manager secret. After that succeeds, remove it from `.env`; later deploys read the existing secret automatically.

**You do not need a GoDaddy domain to view the site.** After deploy, use the `AmplifyDefaultUrl` stack output or the Amplify console.

### Custom domain (Task 4)

Add your domain to `.env` and redeploy:

```bash
DOMAIN_NAME=yourdomain.com
```

Amplify will output DNS records in the console. Add them in GoDaddy, then verify `https://yourdomain.com`.

### Useful commands

| Command | Description |
|---------|-------------|
| `npm run clean` | Remove `build/` and `cdk.out` |
| `npm run build` | Compile TypeScript to `build/` |
| `npm run synth` | Synthesize CloudFormation template |
| `npm run deploy` | Deploy stack to AWS |
| `npm run diff` | Compare deployed vs local |
