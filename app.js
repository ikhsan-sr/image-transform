require('dotenv').config();
const express = require('express');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const IMAGE_DIRECTORY = path.join(__dirname, 'compressed');

const SIZES = [
  { size: 'xs', width: 62, quality: 80 }, // foto profil
  { size: 's', width: 220, quality: 80 }, // thumbnail
  { size: 'm', width: 600, quality: 80 }, // detail
  { size: 'l', width: 1280, quality: 80 }  // large
];
const MAX_SIZE = 2500;

app.use(express.json());
app.use(cors());
app.use('/compressed', express.static(IMAGE_DIRECTORY));


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

function saveImage(buffer, filePath) {
  try {
    fs.writeFileSync(filePath, buffer);
  } catch (error) {
    console.error('Error saving image to file:', error);
    throw new Error('Failed to save image');
  }
}

async function compressImage(buffer, outputPath, width, quality, format = 'original') {
  try {
    const transformer = sharp(buffer).resize(width);
    if (format === 'webp') {
      await transformer.webp({ quality }).toFile(outputPath);
    } else {
      await transformer.toFile(outputPath);
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

    // Save original image
    const originalPath = path.join(IMAGE_DIRECTORY, `${encodedUri}.${originalExt}`);
    saveImage(originalBuffer, originalPath);

    const outputUrls = {
      max: `http://localhost:${PORT}/compressed/${encodedUri}_max.${originalExt}`
    };

    // Compress image to max size
    const maxOutputPath = path.join(IMAGE_DIRECTORY, `${encodedUri}_max.${originalExt}`);
    await compressImage(originalBuffer, maxOutputPath, MAX_SIZE, 80);

    // Compress to predefined sizes
    for (const { size, width, quality } of SIZES) {
      const outputPathWebP = path.join(IMAGE_DIRECTORY, `${encodedUri}_${size}.webp`);
      const outputPathOriginal = path.join(IMAGE_DIRECTORY, `${encodedUri}_${size}.${originalExt}`);
      
      await compressImage(originalBuffer, outputPathWebP, width, quality, 'webp');
      await compressImage(originalBuffer, outputPathOriginal, width, quality);

      outputUrls[size] = `http://localhost:${PORT}/compressed/${encodedUri}_${size}.${originalExt}`;
      outputUrls[`${size}_webp`] = `http://localhost:${PORT}/compressed/${encodedUri}_${size}.webp`;
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
