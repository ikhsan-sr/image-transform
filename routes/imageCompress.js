const express = require('express');
const path = require('path');
const sizeOf = require('buffer-image-size');
const { uploadToS3 } = require('../helpers/s3Helper');
const { compressImage } = require('../helpers/imageHelper');
const { downloadImage } = require('../utils/downloadUtils');
const { createResponse } = require('../utils/responseUtils');
const { validateImageUrl } = require('../utils/validationUtils');
const { IMAGE_DIRECTORY, MAX_SIZE } = require('../constants/imageConstants');
const SIZES = require('../constants/sizeConstants');

const router = express.Router();

router.get('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));

router.get('/compress', async (req, res, next) => {
  const { url } = req.query;

  // Validate image URL
  const { isValid, message } = await validateImageUrl(url);
  if (!isValid) return res.status(400).json(createResponse(400, message));

  try {
    // Download and get image dimensions
    const originalBuffer = await downloadImage(url);
    const originalWidth = sizeOf(originalBuffer)?.width;
    const { base: filename, ext: originalExt } = path.parse(url);

    const encodedFilename = encodeURIComponent(filename);

    // Define keys for S3 storage
    const originalKey = `${IMAGE_DIRECTORY}/${encodedFilename}${originalExt}`;
    const maxKey = `${IMAGE_DIRECTORY}/${encodedFilename}_max${originalExt}`;

    // Upload original image
    await uploadToS3(originalBuffer, originalKey);

    // Compress and upload the image with maximum size
    const maxBuffer = await compressImage(originalBuffer, MAX_SIZE, 80);
    await uploadToS3(originalWidth > MAX_SIZE ? maxBuffer : originalBuffer, maxKey);

    // Prepare output URLs
    const outputUrls = {
      max: `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${maxKey}`,
    };

    // Process and upload images for different sizes
    await Promise.all(SIZES.map(async ({ size, width, quality }) => {
      const sizeKeyBase = `${IMAGE_DIRECTORY}/${encodedFilename}_${size}`;
      const webpKey = `${sizeKeyBase}.webp`;
      const originalSizeKey = `${sizeKeyBase}${originalExt}`;

      // Compress and upload WebP version
      const webpBuffer = await compressImage(originalBuffer, width, quality, 'webp');
      await uploadToS3(webpBuffer, webpKey);

      // Compress and upload original format version
      const originalBufferSized = await compressImage(originalBuffer, width, quality);
      await uploadToS3(originalBufferSized, originalSizeKey);

      // Update output URLs
      outputUrls[size] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${originalSizeKey}`;
      outputUrls[`${size}_webp`] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${webpKey}`;
    }));

    // Send response with output URLs
    res.json(createResponse(200, 'Image compression successful!', outputUrls));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
