use dep::std;
global MAX_WORDS: u32 = 16;

fn main(
    merkle_root: pub Field,
    word_scores: pub [u32; MAX_WORDS], 
    word_count: pub u32, 
    words: [Field; MAX_WORDS], 
    occurrences: [u32; MAX_WORDS], 
    weights: [[u32; 32]; MAX_WORDS] 
) {
    let mut word_score_hashes: [Field; MAX_WORDS] = [0; MAX_WORDS];
    for i in 0..MAX_WORDS {
        let is_active = i < word_count;
        
        if is_active {
            let mut calculated_score = 0u32;
            let word_occurrences = occurrences[i];
            for j in 0..32 {
                let is_valid_occurrence = j < word_occurrences;
                if is_valid_occurrence {
                    calculated_score = calculated_score + weights[i][j];
                }
            }
            assert(calculated_score == word_scores[i]);
            let score_field = word_scores[i] as Field;
            word_score_hashes[i] = std::hash::pedersen_hash([words[i], score_field]);
        } else {
            word_score_hashes[i] = 0;
        }
    }
    
    let calculated_root = build_merkle_root(word_score_hashes, word_count);
    assert(calculated_root == merkle_root);
}

fn build_merkle_root(leaf_hashes: [Field; MAX_WORDS], leaf_count: u32) -> Field {
    let mut result = 0;
    let is_zero = leaf_count == 0u32;
    if is_zero {
        result = 0;
    } else {
        let is_one = leaf_count == 1u32;
        if is_one {
            result = leaf_hashes[0];
        } else {
            let mut layer = leaf_hashes;
            let mut size = leaf_count;
            
            for _level in 0..4 {
                let should_continue = size > 1u32;                
                if should_continue {
                    let mut next: [Field; MAX_WORDS] = [0; MAX_WORDS];
                    let mut idx = 0u32;
                    let pairs = size / 2;
                    
                    for i in 0..MAX_WORDS {
                        let should_process = (i as u32) < pairs;
                        if should_process {
                            let left_idx = i * 2;
                            let right_idx = i * 2 + 1;
                            let left = layer[left_idx];
                            let right = if (right_idx as u32) < size { layer[right_idx] } else { left };
                            next[idx] = std::hash::pedersen_hash([left, right]);
                            idx = idx + 1;
                        }
                    }
                    
                    let is_odd = size % 2 == 1u32;
                    if is_odd {
                        let last_idx = size - 1;
                        let last_value = layer[last_idx];
                        next[idx] = std::hash::pedersen_hash([last_value, last_value]);
                        idx = idx + 1;
                    }
                    for i in 0..MAX_WORDS {
                        layer[i] = next[i];
                    }
                    size = idx;
                }
            }
            result = layer[0];
        }
    }
    result
}

#[test]
fn test_word_score_merkle() {
    let word1_hash = 0x1234567890abcdef;
    let word2_hash = 0xfedcba0987654321;
    let mut words = [0; MAX_WORDS];
    let mut word_scores = [0; MAX_WORDS];
    let mut occurrences = [0; MAX_WORDS];
    let mut weights: [[u32; 32]; MAX_WORDS] = [[0; 32]; MAX_WORDS];
    
    words[0] = word1_hash;
    word_scores[0] = 420;
    occurrences[0] = 42;
    for i in 0..42 {
        if i < 32 {
            weights[0][i] = 10;
        }
    }
    
    words[1] = word2_hash;
    word_scores[1] = 180;
    occurrences[1] = 12;
    for i in 0..12 {
        if i < 32 {
            weights[1][i] = 15;
        }
    }
    
    let hash1 = std::hash::pedersen_hash([word1_hash, 420]);
    let hash2 = std::hash::pedersen_hash([word2_hash, 180]);
    let pair_hash = std::hash::pedersen_hash([hash1, hash2]);
    let merkle_root = std::hash::pedersen_hash([pair_hash, pair_hash]); 
    main(merkle_root, word_scores, 2, words, occurrences, weights);
}

#[test]
fn test_single_word_merkle() {
    let word1_hash = 0x1234567890abcdef;
    let mut words = [0; MAX_WORDS];
    let mut word_scores = [0; MAX_WORDS];
    let mut occurrences = [0; MAX_WORDS];
    let mut weights: [[u32; 32]; MAX_WORDS] = [[0; 32]; MAX_WORDS];
    
    words[0] = word1_hash;
    word_scores[0] = 36;
    occurrences[0] = 10;
    for i in 0..10 {
        if i < 32 {
            weights[0][i] = 3;
        }
    }
    
    let hash1 = std::hash::pedersen_hash([word1_hash, 36]);
    let merkle_root = hash1;
    main(merkle_root, word_scores, 1, words, occurrences, weights);
}