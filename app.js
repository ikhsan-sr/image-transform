require('dotenv').config();
const express = require('express');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const AWS = require('aws-sdk');
const mime = require('mime-types')

const app = express();
const PORT = process.env.PORT || 3000;

const IMAGE_DIRECTORY = 'images/compressed';

const SIZES = [
  { size: 'xs', width: 62, quality: 80 }, // foto profil
  { size: 's', width: 220, quality: 80 }, // thumbnail
  { size: 'm', width: 600, quality: 80 }, // detail
  { size: 'l', width: 1280, quality: 80 }  // large
];
const MAX_SIZE = 2500;

// AWS S3 Configuration
const s3 = new AWS.S3({
  endpoint: process.env.AWS_HOSTNAME,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

app.use(express.json());
app.use(cors());

async function downloadImage(url) {
  try {
    const response = await axios({
      url,
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error('Error downloading image:', error);
    throw new Error('Failed to download image');
  }
}

async function uploadToS3(buffer, key) {
  return new Promise((resolve, reject) => {
    s3.upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mime.lookup(key) || 'image/jpeg',
      ACL: 'public-read'
    }, (err, data) => {
      if (err) {
        console.error('Error uploading image to S3:', err);
        return reject(new Error('Failed to upload image'));
      }
      resolve(data.Location);
    });
  });
}

async function compressImage(buffer, width, quality, format = 'original') {
  try {
    const transformer = sharp(buffer).resize(width);
    if (format === 'webp') {
      return await transformer.webp({ quality }).toBuffer();
    } else {
      return await transformer.toBuffer();
    }
  } catch (error) {
    console.error('Error compressing image:', error);
    throw new Error('Failed to compress image');
  }
}

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, '/index.html'));
});

app.get('/compress', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const originalBuffer = await downloadImage(url);
    const filename = path.basename(url, path.extname(url));
    const originalExt = path.extname(url).split('.').pop();
    const encodedUri = encodeURIComponent(filename);

    // Upload original image
    const originalKey = `${IMAGE_DIRECTORY}/${encodedUri}.${originalExt}`;
    await uploadToS3(originalBuffer, originalKey);

    const outputUrls = {
      max: `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_max.${originalExt}`
    };

    // Compress image to max size
    const maxBuffer = await compressImage(originalBuffer, MAX_SIZE, 80);
    const maxKey = `${IMAGE_DIRECTORY}/${encodedUri}_max.${originalExt}`;
    await uploadToS3(maxBuffer, maxKey);

    // Compress to predefined sizes
    for (const { size, width, quality } of SIZES) {
      const outputBufferWebP = await compressImage(originalBuffer, width, quality, 'webp');
      const outputKeyWebP = `${IMAGE_DIRECTORY}/${encodedUri}_${size}.webp`;
      await uploadToS3(outputBufferWebP, outputKeyWebP);

      const outputBufferOriginal = await compressImage(originalBuffer, width, quality);
      const outputKeyOriginal = `${IMAGE_DIRECTORY}/${encodedUri}_${size}.${originalExt}`;
      await uploadToS3(outputBufferOriginal, outputKeyOriginal);

      outputUrls[size] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_${size}.${originalExt}`;
      outputUrls[`${size}_webp`] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_${size}.webp`;
    }

    res.json(outputUrls);
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).send(error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Image compression service listening on port ${PORT}`);
});
