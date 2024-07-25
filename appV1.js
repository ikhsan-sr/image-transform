const express = require('express')
const https = require('https')
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const sizeOf = require("image-size")
const puppeteer = require('puppeteer')
const _ = require('lodash')

const app = express()
const PORT = 3000

app.use(express.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Stategy for sribu:
// 1. Preventive in File Upload 
// 3. Corrective Compress Image by Request FE (- first request will get original image)
// 4. Scrape images from url target then compress them manual (- must manual)

const SIZES = [
  { size: 'xs', width: 50, quality: 80 },
  { size: 's', width: 220, quality: 80 },
  { size: 'm', width: 800, quality: 80 },
  { size: 'l', width: 1280, quality: 80 }
];

const compressImage = async (buffer) => {
  const resizePromises = SIZES.map(({ size, width, quality }) =>
    sharp(buffer)
      .resize({ width })
      .webp({ quality })
      .toBuffer()
      .then(data => ({ size, data }))
  );

  return await Promise.all(resizePromises);
};

const scrapeImages = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });

  const imgSources = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      return Array.from(images).map(img => img.src?.split("?").shift());
  });

  await browser.close();

  return imgSources;
};

const saveResizedImages = async (source, resizedImages) => {
  return await Promise.all(
    resizedImages.map(({ size, data }) => {
      const fileName = `${encodeURIComponent(source)}-${size}.webp`;
      const filePath = path.join(__dirname, 'compressed', fileName);

      return fs.promises.writeFile(filePath, data)
        .catch(err => {
          console.error(`Error saving ${size} image:`, err);
        });
    })
  );
};

app.get('/compress', async (req, res) => {
  const { url, width, height, quality = 70 } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  const source = url.split("?").shift();

  try {
    // Download the image from the provided URL
    const response = await axios.get(source, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const resizedImages = await compressImage(buffer);

    await saveResizedImages(source, resizedImages);

    res.send('Image transformation completed successfully');
  } catch (err) {
    console.error('Error during image processing:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const sanitizeFilename = (filename) => {
  // Ganti karakter yang tidak diizinkan dengan _
  return filename.replace(/[:\/\\?*"<>|]/g, '_');
};

app.get('/compressv2', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('url is required');
  }

  try {
    console.log('Fetching image from URL:', url);
    
    // Unduh gambar dari URL
    const response = await axios({
      url,
      responseType: 'arraybuffer'
    });
    const originalBuffer = Buffer.from(response.data, 'binary');
    
    // Encode URI gambar asli dan sanitasi nama file
    // const encodedUri = encodeURI(url);
    const encodedUri = encodeURI(url);
    const sanitizedFilename = sanitizeFilename(encodedUri);
    
    // Ekstensi asli gambar
    const originalExt = path.extname(url).split('.').pop();
    const originalPath = path.join(__dirname, 'compressed', `${sanitizedFilename}.${originalExt}`);

    console.log('Saving original image to:', originalPath);

    // Simpan gambar asli
    fs.writeFileSync(originalPath, originalBuffer);

    // Objek untuk menyimpan URL hasil kompresi
    const outputUrls = {};

    // Proses kompresi untuk setiap ukuran dan format
    for (const { size, width, quality } of SIZES) {
      const outputPathWebP = path.join(__dirname, 'compressed', `${sanitizedFilename}_${size}.webp`);
      const outputPathOriginal = path.join(__dirname, 'compressed', `${sanitizedFilename}_${size}.${originalExt}`);
      
      console.log(`Compressing image to ${size} (${width}px)`);
      
      // Kompres dan simpan dalam format WebP
      await sharp(originalBuffer)
        .resize(width)
        .webp({ quality })
        .toFile(outputPathWebP);

      // Kompres dan simpan dalam format asli
      await sharp(originalBuffer)
        .resize(width)
        .toFile(outputPathOriginal);

      // Tambahkan URL ke output
      outputUrls[size] = `http://localhost:${PORT}/compressed/${sanitizedFilename}_${size}.${originalExt}`;
      outputUrls[`${size}_webp`] = `http://localhost:${PORT}/compressed/${sanitizedFilename}_${size}.webp`;
    }

    // URL gambar asli
    const originalUrl = `http://localhost:${PORT}/compressed/${sanitizedFilename}.${originalExt}`;
    outputUrls.max = originalUrl;

    res.json(outputUrls);

  } catch (error) {
    console.error('Error details:', error);
    res.status(500).send('Error processing the image');
  }
});
// Middleware untuk melayani file statis
app.use('/compressed', express.static(path.join(__dirname, 'compressed')));


app.post('/bulk-image-transform', async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'URLs are required and should be an array' });

  try {
    const processImage = async (url) => {
      const source = url.split("?").shift();
      const response = await axios.get(source, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const resizedImages = await compressImage(buffer);
      await saveResizedImages(source, resizedImages);
    };

    await Promise.all(urls.map(processImage));

    res.send('Bulk image transformation completed successfully');
  } catch (err) {
    console.error('Error during bulk image processing:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/image-transform-json', async (req, res, next) => {
  const { url, keys } = req.query;
  const source = url.split("?").shift();
  const keysArray = keys.split(",");

  if (!url) return res.status(400).json({ error: 'URL is required' });

  function findAllProps(obj, propertyName, result = []) {
    _.transform(obj, (acc, value, key) => {
      if (key === propertyName) {
        result.push(value);
      } else if (_.isObject(value)) {
        findAllProps(value, propertyName, result);
      }
    }, result);
    return result;
  }

  try {
    const response = await axios.get(source);
    const data = response.data;
    const allImages = [];

    keysArray.map(key => {
      const urlWebp = findAllProps(data, key);
      
      allImages.push(...urlWebp);
    });

    const images = _.uniq(allImages);

    try {
      const processImage = async (url) => {
        const source = url.split("?").shift();
        const response = await axios.get(source, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const resizedImages = await compressImage(buffer);
        await saveResizedImages(source, resizedImages);
      };

      await Promise.all(images.map(processImage));

      // res.send('Bulk image transformation completed successfully');
    } catch (err) {
      console.error('Error during bulk image processing:', err);
      res.status(500).json({ error: 'Internal server error' });
    }

    res.json(images);
  } catch (error) {
    res.status(500).send('Error fetching data');
  }
});

app.post('/scrape-images', async (req, res) => {
  const { url } = req.body;

  if (!url) res.status(400).send({ error: 'URL is required' });

  try {
    const imgSources = await scrapeImages(url);
    const processImage = async (url) => {
      const source = url.split("?").shift();
      const response = await axios.get(source, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const resizedImages = await compressImage(buffer);
      await saveResizedImages(source, resizedImages);
    };

    await Promise.all(imgSources.map(processImage));

    res.send({ result: 'COMPRESSED' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch images' });
  }
});

app.listen(PORT, () => {
  console.log(`Example app listening on PORT ${PORT}`)
})