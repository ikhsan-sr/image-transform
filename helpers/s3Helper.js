const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const mime = require('mime-types');
const { AWS_HOSTNAME, AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

const s3Client = new S3Client({
  endpoint: AWS_HOSTNAME,
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
});

async function uploadToS3(buffer, key) {
  try {
    const upload = new Upload({
      client: s3Client, 
      params: {
        Bucket: AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mime.lookup(key) || 'image/jpeg',
        ACL: 'public-read'
      }
    });
    return upload.done();
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw new Error('Failed to upload image');
  }
}

module.exports = { uploadToS3 };
