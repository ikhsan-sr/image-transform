const AWS = require('aws-sdk');
const mime = require('mime-types');
const { AWS_HOSTNAME, AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

AWS.config.update({
  endpoint: AWS_HOSTNAME,
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

async function uploadToS3(buffer, key) {
  try {
    const data = await s3.upload({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mime.lookup(key) || 'image/jpeg',
      ACL: 'public-read'
    }).promise();
    return data.Location;
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw new Error('Failed to upload image');
  }
}

module.exports = { uploadToS3 };
