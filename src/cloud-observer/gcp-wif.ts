import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { readFile } from "node:fs/promises";
import { AwsClient, type AwsClientOptions, type AwsSecurityCredentials } from "google-auth-library";

export type GcpAuthClient = {
  getAccessToken(): Promise<{ token?: string | null }>;
};

export type GcpAuth = {
  getClient(): Promise<GcpAuthClient>;
};

type AwsCredentials = {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
};

export type AwsCredentialsProvider = () => Promise<AwsCredentials>;

export type GcpWifAuthOptions = {
  credentialsPath: string;
  scopes: readonly string[];
  region?: string;
  awsCredentials?: AwsCredentialsProvider;
  readCredentialsFile?: (path: string) => Promise<string>;
};

export function createGcpWifAuth(options: GcpWifAuthOptions): GcpAuth {
  let clientPromise: Promise<GcpAuthClient> | undefined;
  return {
    getClient: async () => {
      clientPromise ??= buildGcpWifClient(options);
      return clientPromise;
    },
  };
}

export function createInMemoryAwsCredentialsSupplier(provider: AwsCredentialsProvider, region: string) {
  return {
    getAwsRegion: async () => region,
    getAwsSecurityCredentials: async (): Promise<AwsSecurityCredentials> => {
      const credentials = await provider();
      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        throw new Error("AWS credentials unavailable for GCP WIF");
      }
      return {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken ? { token: credentials.sessionToken } : {}),
      };
    },
  };
}

async function buildGcpWifClient(options: GcpWifAuthOptions): Promise<GcpAuthClient> {
  const readConfig = options.readCredentialsFile ?? ((path: string) => readFile(path, "utf8"));
  const config = JSON.parse(await readConfig(options.credentialsPath)) as Record<string, unknown>;
  if (config.type !== "external_account" || config.subject_token_type !== "urn:ietf:params:aws:token-type:aws4_request") {
    throw new Error("GCP WIF credentials must be an AWS external-account configuration");
  }

  const { credential_source: _credentialSource, ...clientConfig } = config;
  const provider = options.awsCredentials ?? defaultProvider();
  const region = options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-southeast-1";
  const client = new AwsClient({
    ...(clientConfig as unknown as AwsClientOptions),
    scopes: [...options.scopes],
    aws_security_credentials_supplier: createInMemoryAwsCredentialsSupplier(provider, region),
  });
  return client;
}
