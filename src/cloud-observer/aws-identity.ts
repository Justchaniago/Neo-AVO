import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

export type AwsCallerIdentity = {
  account: string;
  arn: string;
  userId: string;
  region: string;
};

type StsClient = Pick<STSClient, "send">;

/** Uses the AWS SDK default credential chain; it never accepts credentials as arguments. */
export async function getAwsCallerIdentity(options: { region?: string; client?: StsClient } = {}): Promise<AwsCallerIdentity> {
  const region = options.region ?? process.env.AWS_REGION ?? "ap-southeast-1";
  const client = options.client ?? new STSClient({ region });
  const identity = await client.send(new GetCallerIdentityCommand({}));
  if (!identity.Account || !identity.Arn || !identity.UserId) {
    throw new Error("AWS caller identity response was incomplete");
  }
  return { account: identity.Account, arn: identity.Arn, userId: identity.UserId, region };
}
