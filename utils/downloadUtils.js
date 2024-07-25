const axios = require('axios');

async function downloadImage(url) {
  try {
    const response = await axios({ url, responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error('Error downloading image:', error);
    throw new Error('Failed to download image');
  }
}

module.exports = { downloadImage };
