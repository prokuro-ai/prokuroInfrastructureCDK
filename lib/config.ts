import { join } from 'path';

/** Secrets Manager name for Nexar API credentials (enrichment service). */
export const NEXAR_SECRET_NAME = 'prokuro/nexar/credentials';

/** Secrets Manager name for GitHub PAT (Amplify repo access). */
export const GITHUB_SECRET_NAME = 'prokuro/github/amplify-token';

export const GITHUB_OWNER = 'prokuro-ai';
export const GITHUB_REPO = 'prokuroWeb';
export const PRODUCTION_BRANCH = 'main';

/**
 * Path to prokuroBackend on the machine running `cdk deploy`.
 * Used only at synth/deploy time by BackendImages (DockerImageAsset) — not on AWS.
 * Goes away once we switch to CI-built ECR images; see backend-images.ts.
 */
export const BACKEND_DIR = join(__dirname, '../../../prokuroBackend');

export interface ProkuroConfig {
  domainName?: string;
  nexarClientId?: string;
  nexarClientSecret?: string;
  githubToken?: string;
}

export function loadConfig(): ProkuroConfig {
  return {
    domainName: process.env.DOMAIN_NAME?.trim() || undefined,
    nexarClientId: process.env.NEXAR_CLIENT_ID?.trim() || undefined,
    nexarClientSecret: process.env.NEXAR_CLIENT_SECRET?.trim() || undefined,
    githubToken: process.env.GITHUB_TOKEN?.trim() || undefined,
  };
}
