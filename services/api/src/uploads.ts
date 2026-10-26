import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Assets live in a private S3 bucket. The browser uploads via presigned PUTs
 * issued here and reads via short-lived signed URLs — the API never proxies
 * file bytes.
 */
let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
  return client;
}

function bucketName(): string {
  const bucket = process.env.ASSETS_BUCKET_NAME;
  if (!bucket) {
    throw new Error('ASSETS_BUCKET_NAME is required for file uploads');
  }
  return bucket;
}

const SAFE_NAME = /[^A-Za-z0-9._-]+/g;

export function assetKeyFor(tenantId: string, kind: string, filename: string): string {
  const clean = filename.replace(SAFE_NAME, '-').slice(-80) || 'file';
  return `tenants/${tenantId}/${kind}/${crypto.randomUUID()}-${clean}`;
}

export function assertTenantKey(tenantId: string, key: string): void {
  if (!key.startsWith(`tenants/${tenantId}/`)) {
    throw new Error('key is outside the tenant prefix');
  }
}

export async function presignUpload(
  tenantId: string,
  kind: string,
  filename: string,
  contentType: string,
): Promise<{ key: string; uploadUrl: string }> {
  const key = assetKeyFor(tenantId, kind, filename);
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { key, uploadUrl: url };
}

export async function presignDownload(tenantId: string, key: string): Promise<string> {
  assertTenantKey(tenantId, key);
  const filename = key.split('/').pop() ?? 'file';
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
    }),
    { expiresIn: 300 },
  );
}