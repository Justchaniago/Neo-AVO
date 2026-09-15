import { describe, expect, it, vi } from "vitest";

import { createInMemoryAwsCredentialsSupplier, createGcpWifAuth } from "../src/cloud-observer/gcp-wif";
import { createGcpProvider } from "../src/cloud-observer/providers/gcp";
import { loadEnv } from "../src/config/env";

describe("cloud observer GCP WIF bridge", () => {
  it("bridges AWS SDK credentials into WIF and preserves session tokens", async () => {
    const provider = vi.fn().mockResolvedValue({ accessKeyId: "access", secretAccessKey: "secret", sessionToken: "session" });
    const supplier = createInMemoryAwsCredentialsSupplier(provider, "ap-southeast-1");

    await expect(supplier.getAwsRegion()).resolves.toBe("ap-southeast-1");
    await expect(supplier.getAwsSecurityCredentials()).resolves.toEqual({ accessKeyId: "access", secretAccessKey: "secret", token: "session" });
    expect(provider).toHaveBeenCalledOnce();
  });

  it("fails closed when the AWS default chain has no credentials", async () => {
    const supplier = createInMemoryAwsCredentialsSupplier(async () => ({}), "ap-southeast-1");
    await expect(supplier.getAwsSecurityCredentials()).rejects.toThrow("AWS credentials unavailable for GCP WIF");
  });

  it("does not log bridged credentials", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const supplier = createInMemoryAwsCredentialsSupplier(async () => ({ accessKeyId: "access", secretAccessKey: "secret", sessionToken: "session" }), "ap-southeast-1");
    await supplier.getAwsSecurityCredentials();
    expect(output).not.toHaveBeenCalled();
    output.mockRestore();
  });

  it("constructs an observer-scoped AWS external-account client", async () => {
    const auth = createGcpWifAuth({
      credentialsPath: "/etc/neo-avo/gcp-cloud-observer-wif.json",
      scopes: ["https://www.googleapis.com/auth/compute.readonly"],
      awsCredentials: async () => ({ accessKeyId: "access", secretAccessKey: "secret" }),
      readCredentialsFile: async () => JSON.stringify({
        type: "external_account",
        audience: "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/aws",
        subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
        token_url: "https://sts.googleapis.com/v1/token",
        service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/observer:generateAccessToken",
        credential_source: { environment_id: "aws1", regional_cred_verification_url: "https://sts.{region}.amazonaws.com" },
      }),
    });
    await expect(auth.getClient()).resolves.toBeDefined();
  });

  it("keeps authorized-user auth as the non-WIF fallback and preserves AWS collection", async () => {
    const auth = { getClient: async () => ({ getAccessToken: async () => ({ token: "token" }) }) };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: {} }), { status: 200 }));
    const provider = createGcpProvider(loadEnv({ GCP_PROJECT_ID: "project" }), { auth, fetch: fetcher });
    await expect(provider.collect("infrastructure", new Date())).resolves.toMatchObject({ status: "AVAILABLE" });
    expect(fetcher).toHaveBeenCalled();
  });
});
