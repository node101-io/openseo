import { Request, Response } from 'express';

import Endpoint from '../../models/Endpoint.js';

export default async (
  req: Request,
  res: Response,
): Promise<any> => {
  const { keywords, page } = req.query;

  if (!keywords || typeof keywords !== 'string')
    return res.json({
      error: {
        code: 400,
        message: 'Invalid request query'
      }
    });

  const keywordsArray = keywords.split(',');

  const findEndpointResult = await Endpoint.findEndpointByKeywords(keywordsArray, Number(page));

  if (findEndpointResult instanceof Error)
    return res.json({
      error: {
        code: 500,
        message: findEndpointResult.message
      }
    });

  return res.json({
    data: {
      endpoints: findEndpointResult
    }
  });
};