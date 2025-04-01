import cors from 'cors';
import dotenv from 'dotenv';
import express, { Express } from 'express';
import mongoose from 'mongoose';

import endpointRouter from './routes/endpointRouter.js';

dotenv.config();

const app: Express = express();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/openseo';
const PORT = process.env.PORT || 8000;

await mongoose.connect(MONGODB_URI);

app.use(express.json());
app.use(cors());

app.use('/endpoint', endpointRouter);

app.listen(PORT, () => {
  console.log(`Server is on port ${PORT}.`);
});
