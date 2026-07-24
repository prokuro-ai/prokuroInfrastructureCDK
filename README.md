# prokuroInfrastructureCDK

AWS CDK for Prokuro — one stack (`Prokuro`): Rust backend on ECS Fargate + Cognito + prokuroWeb on Amplify.

## Prerequisites

- AWS CLI (`prokuro` profile), Node.js 22+, Docker Desktop
- GitHub PAT with `repo` scope for `prokuro-ai/prokuroWeb` (first deploy only)
- Digi-Key credentials — first backend deploy only
- Google OAuth web client — only when enabling Google sign-in


## Deploy

```bash
cd prokuroInfrastructureCDK
npm install
cp .env.example .env   # fill in GITHUB_TOKEN + Digi-Key secrets for first deploy
export AWS_PROFILE=prokuro
npm run build
npx cdk bootstrap aws://713463138528/us-west-2   # once
npx cdk deploy Prokuro
```

First deploy builds four backend Docker images — allow 10–20 minutes.

**`.env` (first deploy only):**

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Amplify GitHub access → stored in Secrets Manager |
| `DIGIKEY_CLIENT_ID` / `DIGIKEY_CLIENT_SECRET` | Backend enrichment → stored in Secrets Manager |

After the first successful deploy, remove `GITHUB_TOKEN` and `DIGIKEY_*` from `.env`. CDK reads the existing Secrets Manager entries on subsequent deploys.

CDK creates the Amplify app, connects `prokuro-ai/prokuroWeb` on branch `main`, and wires branch env vars (`GATEWAY_URL`, `NEXT_PUBLIC_COGNITO_*`).

**Delete any manually created Amplify app** before deploying if you created one in the console — CDK will create `prokuro-web`.

## Google sign-in

1. The Cognito origin is `https://prokuro-auth.auth.us-west-2.amazoncognito.com`.
2. In Google Cloud, create an OAuth 2.0 web client. Add the Cognito origin as an authorized JavaScript origin and `<Cognito origin>/oauth2/idpresponse` as an authorized redirect URI.
3. Store the OAuth client in `prokuro/google/oauth` as a Secrets Manager JSON secret with keys `client_id` and `client_secret`. Use a customer-managed KMS key and do not place either value in `.env`.
4. Run `npm run build`, `npm run diff`, review the user-pool client update, then run `npm run deploy`.

The Cognito app callback URLs are `https://main.d1kbe3qii40ozr.amplifyapp.com/auth/callback` and `http://localhost:3010/auth/callback`. The Google redirect URI is the Cognito `/oauth2/idpresponse` endpoint, not the application callback.

## Outputs

`GatewayUrl`, `AmplifyDefaultUrl`, Cognito IDs, `PartsTableName`, `UnresolvedTableName`.

## DynamoDB (enrichment)

CDK provisions:

| Table | Keys |
|-------|------|
| `prokuro-parts` | PK `pk`, SK `sk` (`CURRENT`); attribute `fetched_at` |
| `prokuro-unresolved` | PK `pk`, SK `first_seen` |

One current row per unique MPN key (upsert). Local cargo runs use these AWS tables via the default credential chain.

Enrichment on Fargate gets `PARTS_TABLE` / `UNRESOLVED_TABLE` and IAM read/write on both.
