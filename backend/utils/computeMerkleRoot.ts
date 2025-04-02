// import { generateMerkleTree, config } from '@node101/merkle-tree';
import { generateMerkleTree } from '@node101/merkle-tree';

import { KeywordScore } from '../models/endpoint/Endpoint';

// TODO
// config({
//   hash(data: string): string {
//     return data;
//   }
// })

export default async function(keywords_scores: KeywordScore[]): Promise<string | Error> {
  const merkleTree = await generateMerkleTree(
    keywords_scores.map((keyword_score) => {
      return `${keyword_score.keyword}:${keyword_score.score}`;
    })
  ).catch(err => new Error('unknown_error', { cause: err }));

  if (merkleTree instanceof Error)
    return merkleTree;

  return merkleTree.root;
};
