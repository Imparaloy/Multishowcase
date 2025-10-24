// src/services/aws/s3.service.js
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new S3Client({ region: process.env.AWS_REGION });

const BUCKET = process.env.S3_BUCKET_NAME;

export async function getPresignedPutUrl({ key, contentType, expiresIn = 300 }) {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function list(prefix) {
  const cmd = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix });
  const res = await client.send(cmd);
  return res.Contents || [];
}

export async function objectsToSignedGet(objects, expiresIn = 300) {
  return Promise.all(
    (objects || []).map(async (obj, i) => {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key });
      const url = await getSignedUrl(client, cmd, { expiresIn });
      return { id: i, key: obj.Key, url };
    })
  );
}
