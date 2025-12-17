use dep::std;
global MAX_CHUNKS: u32 = 32;
global MAX_KEYWORDS: u32 = 16;

fn main(
    keyword_hashes: [Field; MAX_KEYWORDS],
    keyword_count: u32,
    html_root: pub Field,
    word_hashes: [Field; MAX_CHUNKS],
    scores: [Field; MAX_CHUNKS],
    is_keyword: [u32; MAX_CHUNKS],
    chunk_count: u32,
    occurrences: pub u32
) {
    let mut current_root = 0;
    let mut found = 0;
    
    for i in 0..MAX_CHUNKS {
        let is_in_range = i < chunk_count;
        let is_kw = is_keyword[i] == 1u32;
        
        if is_in_range {
            if is_kw {
                let mut matches_keyword = false;
                for j in 0..MAX_KEYWORDS {
                    let is_valid_keyword = j < keyword_count;
                    if is_valid_keyword {
                        if word_hashes[i] == keyword_hashes[j] {
                            matches_keyword = true;
                        }
                    }
                }
                assert(matches_keyword);
                found += 1;

                let word_score_hash = std::hash::pedersen_hash([word_hashes[i], scores[i]]);
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
fn test_teleportation_tree() {
    let keyword_hash = 0x0857c95b;
    let mut keyword_hashes = [0; MAX_KEYWORDS];
    keyword_hashes[0] = keyword_hash;
    
    let mut word_hashes = [0; MAX_CHUNKS];
    let mut scores = [0; MAX_CHUNKS];
    let mut is_keyword = [0; MAX_CHUNKS];

    word_hashes[0] = keyword_hash;
    scores[0] = 10;
    is_keyword[0] = 1;
    
    word_hashes[1] = 0x12345678;
    scores[1] = 5;
    is_keyword[1] = 0;
    
    word_hashes[2] = keyword_hash;
    scores[2] = 15;
    is_keyword[2] = 1;
    
    let word_score_hash1 = std::hash::pedersen_hash([word_hashes[0], scores[0]]);
    let html_root_step1 = std::hash::pedersen_hash([0, word_score_hash1]);
    let html_root_step2 = std::hash::pedersen_hash([html_root_step1, word_hashes[1]]);
    
    let word_score_hash2 = std::hash::pedersen_hash([word_hashes[2], scores[2]]);
    let html_root = std::hash::pedersen_hash([html_root_step2, word_score_hash2]);

    main(keyword_hashes, 1, html_root, word_hashes, scores, is_keyword, 3, 2);
}   