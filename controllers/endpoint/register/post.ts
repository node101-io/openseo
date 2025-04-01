import { Request, Response } from 'express';
import validator from 'validator';

import Endpoint, { KeywordScore } from '../../../models/endpoint/Endpoint.js';

export default async (
  req: Request,
  res: Response,
) => {
  const { website_url, proof, keywords_scores } = req.body;

  if (!website_url || !validator.isURL(website_url))
    return res.json({
      error: {
        code: 400,
        message: 'Invalid website URL'
      }
    });

  if (
    !proof ||
    typeof proof !== 'object' ||
    typeof proof.content !== 'object' ||
    typeof proof.merkle_root !== 'string' ||
    typeof proof.html_hash !== 'string'
  )
    return res.json({
      error: {
        code: 400,
        message: 'Invalid proof'
      }
    });

  if (
    !Array.isArray(keywords_scores) ||
    !keywords_scores.every((item: KeywordScore) =>
      typeof item === 'object' &&
      typeof item.keyword === 'string' &&
      typeof item.score === 'number'
    )
  )
    return res.json({
      error: {
        code: 400,
        message: 'Invalid keywords score'
      }
    });

  const registerEndpointResult = await Endpoint.registerEndpoint({
    proof,
    website_url,
    keywords_scores
  }).catch((err) => {
    return res.json({
      error: {
        code: 500,
        message: err.message
      }
    });
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
