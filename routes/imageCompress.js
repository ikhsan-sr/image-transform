const express = require('express');
const path = require('path');
const sizeOf = require('buffer-image-size');

const { uploadToS3 } = require('../helpers/s3Helper');
const { compressImage } = require('../helpers/imageHelper');
const { downloadImage } = require('../utils/downloadUtils');
const { createResponse } = require('../utils/responseUtils');

const { IMAGE_DIRECTORY, MAX_SIZE } = require('../constants/imageConstants');
const SIZES = require('../constants/sizeConstants');

const router = express.Router();

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

router.get('/compress', async (req, res, next) => {
  const { url } = req.query;

  if (!url) return res.json(createResponse(400, 'URL is required!', null));

  try {
    const originalBuffer = await downloadImage(url);
    const originalWidth = sizeOf(originalBuffer)?.width;
    const filename = path.basename(url, path.extname(url));
    const originalExt = path.extname(url).split('.').pop();
    const encodedUri = encodeURIComponent(filename);

    const originalKey = `${IMAGE_DIRECTORY}/${encodedUri}.${originalExt}`;
    await uploadToS3(originalBuffer, originalKey);

    const outputUrls = {
      max: `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_max.${originalExt}`
    };

    const maxBuffer = await compressImage(originalBuffer, MAX_SIZE, 80);
    const maxKey = `${IMAGE_DIRECTORY}/${encodedUri}_max.${originalExt}`;
    await uploadToS3( originalWidth > MAX_SIZE ? maxBuffer : originalBuffer, maxKey);

    await Promise.all(SIZES.map(async ({ size, width, quality }) => {
      const outputBufferWebP = await compressImage(originalBuffer, width, quality, 'webp');
      const outputKeyWebP = `${IMAGE_DIRECTORY}/${encodedUri}_${size}.webp`;
      await uploadToS3(outputBufferWebP, outputKeyWebP);

      const outputBufferOriginal = await compressImage(originalBuffer, width, quality);
      const outputKeyOriginal = `${IMAGE_DIRECTORY}/${encodedUri}_${size}.${originalExt}`;
      await uploadToS3(outputBufferOriginal, outputKeyOriginal);

      outputUrls[size] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_${size}.${originalExt}`;
      outputUrls[`${size}_webp`] = `${process.env.AWS_HOSTNAME}/${process.env.AWS_BUCKET_NAME}/${IMAGE_DIRECTORY}/${encodedUri}_${size}.webp`;
    }));

    res.json(createResponse(200, 'Success compress image!', outputUrls));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
