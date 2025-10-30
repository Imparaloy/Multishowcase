// src/services/aws/s3.service.js
import dotenv from "dotenv";
dotenv.config();
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new S3Client({ region: process.env.AWS_REGION });

export const BUCKET = process.env.S3_BUCKET_NAME;

export async function getPresignedPutUrl({ key, contentType, expiresIn = 300 }) {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(client, cmd, { expiresIn });
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

// Upload raw data directly to S3 and return the public URL
export async function uploadObject({ key, body, contentType }) {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await client.send(cmd);
  return publicUrlForKey(key);
}

// Check if an object exists in S3 (returns boolean)
export async function headObjectExists(key) {
  try {
    const cmd = new HeadObjectCommand({ Bucket: BUCKET, Key: key });
    await client.send(cmd);
    return true;
  } catch (err) {
    return false;
  }
}

// Build a public URL for a given key (virtual-hosted–style)
export function publicUrlForKey(key) {
  return `https://${BUCKET}.s3.amazonaws.com/${key}`;
}
