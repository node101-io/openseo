use dep::std;
global MAX_WORDS: u32 = 32;

fn main(
    keyword_hash: Field,
    html_root: pub Field,
    word_hashes: [Field; MAX_WORDS],
    keyword_scores: [Field; MAX_WORDS],
    is_keyword: [u32; MAX_WORDS],
    word_count: u32,
    occurrences: pub u32
) {
    let mut current_root = 0;
    let mut found = 0;
    
    for i in 0..MAX_WORDS {
        let is_in_range = i < word_count;
        let is_kw = is_keyword[i] == 1u32;
        
        if is_in_range {
            if is_kw {
                assert(word_hashes[i] == keyword_hash);
                found += 1;

                let word_score_hash = std::hash::pedersen_hash([word_hashes[i], keyword_scores[i]]);
                current_root = std::hash::pedersen_hash([current_root, word_score_hash]);
            } else {
                current_root = std::hash::pedersen_hash([current_root, word_hashes[i]]);
            }
        }
    }
    
    assert(found == occurrences);
    assert(current_root == html_root);
}

#[test]
fn test_single_keyword() {
    let keyword_hash = 0x0857c95b;
    
    let mut word_hashes = [0; MAX_WORDS];
    let mut keyword_scores = [0; MAX_WORDS];
    let mut is_keyword = [0; MAX_WORDS];

    word_hashes[0] = keyword_hash;
    keyword_scores[0] = 10;
    is_keyword[0] = 1;
    
    word_hashes[1] = 0xabcdef00;
    keyword_scores[1] = 0;
    is_keyword[1] = 0;
    
    word_hashes[2] = keyword_hash;
    keyword_scores[2] = 15;
    is_keyword[2] = 1;
    
    let word_score_hash1 = std::hash::pedersen_hash([word_hashes[0], keyword_scores[0]]);
    let html_root_step1 = std::hash::pedersen_hash([0, word_score_hash1]);
    
    let html_root_step2 = std::hash::pedersen_hash([html_root_step1, word_hashes[1]]);
    
    let word_score_hash2 = std::hash::pedersen_hash([word_hashes[2], keyword_scores[2]]);
    let html_root = std::hash::pedersen_hash([html_root_step2, word_score_hash2]);

    main(keyword_hash, html_root, word_hashes, keyword_scores, is_keyword, 3, 2);
}
