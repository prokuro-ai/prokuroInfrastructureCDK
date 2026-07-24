import { join } from 'path';

/** Secrets Manager name for Digi-Key API credentials (enrichment service). */
export const DIGIKEY_SECRET_NAME = 'prokuro/digikey/credentials';

/** Secrets Manager name for GitHub PAT (Amplify repo access). */
export const GITHUB_SECRET_NAME = 'prokuro/github/amplify-token';

/** Secrets Manager JSON secret with client_id and client_secret. */
export const GOOGLE_OAUTH_SECRET_NAME = 'prokuro/google/oauth';

export const GITHUB_OWNER = 'prokuro-ai';
export const GITHUB_REPO = 'prokuroWeb';
export const PRODUCTION_BRANCH = 'main';
export const COGNITO_DOMAIN_PREFIX = 'prokuro-auth';
export const WEB_BASE_URL =
  'https://main.d1kbe3qii40ozr.amplifyapp.com';

export const BACKEND_DIR = join(__dirname, '../../../prokuroBackend');

export interface ProkuroConfig {
  digikeyClientId?: string;
  digikeyClientSecret?: string;
  githubToken?: string;
}

export function loadConfig(): ProkuroConfig {
  return {
    digikeyClientId: process.env.DIGIKEY_CLIENT_ID?.trim() || undefined,
    digikeyClientSecret: process.env.DIGIKEY_CLIENT_SECRET?.trim() || undefined,
    githubToken: process.env.GITHUB_TOKEN?.trim() || undefined,
  };
}
