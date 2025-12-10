use dep::std;
global MAX_WORDS: u32 = 16;

fn main(
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
}

#[test]
fn test_word_score_hashes() {
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
    main(word_scores, 2, words, occurrences, weights);
}

#[test]
fn test_single_word_hash() {
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
    
    main(word_scores, 1, words, occurrences, weights);
}