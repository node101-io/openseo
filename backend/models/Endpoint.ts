import mongoose, { Schema, Model } from 'mongoose';

import verifyProof from '../utils/verifyProof';
import computeHTMLHash from '../utils/computeHTMLHash';
import computeMerkleRoot from '../utils/computeMerkleRoot';

const ITEMS_PER_PAGE = 10;

export interface KeywordScore {
  keyword: string;
  score: number;
};

export interface EndpointInterface {
  proof: string;
  website_url: string;
  html_hash: string;
  merkle_root: string;
  keywords_scores: KeywordScore[];
};

interface EndpointModel extends Model<EndpointInterface> {
  registerEndpoint(
    endpoint: {
      proof: string;
      website_url: string;
      keywords_scores: KeywordScore[];
    }
  ): Promise<EndpointInterface | Error>;
  findEndpointByKeywords(
    keywords: string[],
    page?: number
  ): Promise<EndpointInterface[] | Error>;
};

const endpointSchema = new Schema<EndpointInterface>({
  proof: {
    type: String,
    required: true,
  },
  website_url: {
    type: String,
    required: true,
    unique: true
  },
  html_hash: {
    type: String,
    required: true
  },
  merkle_root: {
    type: String,
    required: true
  },
  keywords_scores: [{
    keyword: {
      type: String,
      lowercase: true,
      required: true,
      index: true
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      index: true
    }
  }]
}, {
  _id: false,
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

endpointSchema.statics.registerEndpoint = async function(
  endpoint: Parameters<EndpointModel['registerEndpoint']>[0]
): Promise<EndpointInterface | Error> {
  const { proof, website_url, keywords_scores } = endpoint;

  const computedHTMLHash = await computeHTMLHash(website_url);
  if (computedHTMLHash instanceof Error)
    return computedHTMLHash;

  const computedMerkleRoot = await computeMerkleRoot(keywords_scores);
  if (computedMerkleRoot instanceof Error)
    return computedMerkleRoot;

  const verificationResult = await verifyProof(proof);
  if (verificationResult instanceof Error)
    return verificationResult;

  if (verificationResult.html_hash !== computedHTMLHash)
    return new Error('invalid_proof', { cause: 'HTML hash does not match' });

  if (verificationResult.merkle_root !== computedMerkleRoot)
    return new Error('invalid_proof', { cause: 'Merkle root does not match' });

  const registeredEndpoint = await Endpoint.findOneAndUpdate(
    { website_url: endpoint.website_url },
    {
      ...endpoint,
      html_hash: computedHTMLHash,
      merkle_root: computedMerkleRoot
    },
    {
      new: true,
      upsert: true,
      runValidators: true
    }
  ).catch(err => {
    return new Error('database_error', { cause: err.message });
  });

  return registeredEndpoint;
};

endpointSchema.statics.findEndpointByKeywords = async function(
  keywords: Parameters<EndpointModel['findEndpointByKeywords']>[0],
  page: Parameters<EndpointModel['findEndpointByKeywords']>[1]
): Promise<EndpointInterface[] | Error> {
  const endpoints = await Endpoint.aggregate([
    { $match: { 'keywords_scores.keyword': { $in: keywords } } },
    { $addFields: {
      total_score: {
        $sum: {
          $map: {
            input: {
              $filter: {
                input: '$keywords_scores',
                as: 'keyword_score',
                cond: { $in: ['$$keyword_score.keyword', keywords] }
              }
            },
            as: 'filtered_score',
            in: '$$filtered_score.score'
          }
        }
      }
    }},
    { $sort: { total_score: -1 } },
    { $skip: ((page || 1) - 1 ) * ITEMS_PER_PAGE },
    { $limit: ITEMS_PER_PAGE }
  ]).catch(err => {
    return new Error('database_error', { cause: err.message });
  });

  return endpoints;
};

const Endpoint = mongoose.model<EndpointInterface, EndpointModel>('Endpoint', endpointSchema);

export default Endpoint;
