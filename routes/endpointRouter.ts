import express, { Router } from 'express';

import registerEndpointPostController from '../controllers/endpoint/register/post.js';

const router: Router = express.Router();

router.post(
  '/register',
  registerEndpointPostController
);

export default router;
