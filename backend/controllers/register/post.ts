import { Request, Response } from 'express';
import { z } from 'zod';

import Endpoint from '../../models/Endpoint.js';

const RequestBody = z.object({
  website_url: z.string().url(),
  proof:  z.string(),
  keywords_scores: z.array(
    z.object({
      keyword: z.string(),
      score: z.number()
    })
  )
});

export default async (
  req: Request,
  res: Response,
): Promise<any> => {
  const { success, data } = RequestBody.safeParse(req.body);

  if (!success || !data)
    return res.json({
      error: {
        code: 400,
        message: 'Invalid request body'
      }
    });

  const registerEndpointResult = await Endpoint.registerEndpoint({
    proof: data.proof,
    website_url: data.website_url,
    keywords_scores: data.keywords_scores
  });

  if (registerEndpointResult instanceof Error)
    return res.json({
      error: {
        code: 500,
        message: registerEndpointResult.message
      }
    });

  return res.json({
    data: {
      endpoint: registerEndpointResult
    }
  });
};
