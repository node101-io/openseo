import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';

import 'dotenv/config';

import searchEndpointGetController from './controllers/search/get.js';
import registerEndpointPostController from './controllers/register/post.js';

const app = express();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/openseo';
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected.'))
  .catch(err => console.log('MongoDB connection error:', err));

app.use(express.json());
app.use(cors());

app.get(
  '/search',
  searchEndpointGetController
);
app.post(
  '/register',
  registerEndpointPostController
);

app.listen(PORT, () => {
  console.log(`Server is on port ${PORT}.`);
});
