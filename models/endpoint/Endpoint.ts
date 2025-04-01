import mongoose, { Schema, Model } from 'mongoose';
import verifyProofs from './functions/verifyProofs';

export interface Proof {
  content: object;
  merkle_root: string;
  html_hash: string;
};

export interface KeywordScore {
  keyword: string;
  score: number;
};

export interface EndpointInterface {
  proof: Proof;
  website_url: string;
  keywords_scores: KeywordScore[];
};

interface EndpointModel extends Model<EndpointInterface> {
  registerEndpoint(endpoint: EndpointInterface): Promise<EndpointInterface | Error>;
};

const endpointSchema = new Schema<EndpointInterface>({
  proof: {
    content: {
      type: Object,
      required: true
    },
    merkle_root: {
      type: String,
      required: true
    },
    html_hash: {
      type: String,
      required: true
    }
  },
  website_url: {
    type: String,
    required: true,
    unique: true
  },
  keywords_scores: [{
    keyword: { type: String, required: true },
    score: { type: Number, required: true }
  }]
}, { _id: false });

endpointSchema.statics.registerEndpoint = async function(
  endpoint: EndpointInterface
): Promise<EndpointInterface | Error> {
  const verificationResult = await verifyProofs(endpoint.proof);
  if (verificationResult instanceof Error)
    return verificationResult;

  const registeredEndpoint = await Endpoint.findOneAndUpdate(
    { website_url: endpoint.website_url },
    endpoint,
    {
      new: true,
      upsert: true,
      runValidators: true
    }
  ).catch(err => new Error(err.message, { cause: 'Failed to register endpoint' }));

  return registeredEndpoint;
};

const Endpoint = mongoose.model<EndpointInterface, EndpointModel>('Endpoint', endpointSchema);

export default Endpoint;
