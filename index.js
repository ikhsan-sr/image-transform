require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imageCompress = require('./routes/imageCompress');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use('/', imageCompress);

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).send(err.message);
});

app.listen(PORT, () => console.log(`Image compression service listening on port ${PORT}`));
