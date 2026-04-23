use dep::std;
global MAX_WORDS: u32 = 128;
global MASK_WORDS: u32 = 4;

// tag id - weight

fn get_weight(tag_id: u32) -> Field {
    if tag_id == 1 {
        12
    } // title
    else if tag_id == 2 {
        10
    } // h1
    else if tag_id == 3 {
        8
    } // h2
    else if tag_id == 4 {
        6
    } // h3
    else if tag_id == 5 {
        5
    } // h4
    else if tag_id == 6 {
        4
    } // h5
    else if tag_id == 7 {
        3
    } // h6
    else if tag_id == 8 {
        7
    } // meta
    else if tag_id == 9 {
        5
    } // strong
    else if tag_id == 10 {
        5
    } // b
    else if tag_id == 11 {
        4
    } // i
    else if tag_id == 12 {
        6
    } // a
    else if tag_id == 13 {
        3
    } // p
    else if tag_id == 14 {
        2
    } // span
    else if tag_id == 15 {
        2
    } // div
    else if tag_id == 16 {
        3
    } // li
    else if tag_id == 17 {
        2
    } // td
    else if tag_id == 18 {
        4
    } // th
    else if tag_id == 19 {
        3
    } // blockquote
    else if tag_id == 20 {
        3
    } // code
    else {
        1
    } // default
}

fn main(
    keyword_count: u32, // number of keywords
    is_keyword: [u32; MASK_WORDS], // bit i is 1 if word i is keyword, 0 otherwise
    keyword_positions: [u32; MAX_WORDS], // positions where keywords are located
    word_hashes: [Field; MAX_WORDS], // hash of each item (chunk or keyword)
    tag_ids: [u32; MAX_WORDS], // tag id for each word
    word_count: u32, // number of items (chunks and keywords)
) -> pub (Field, Field, [Field; MAX_WORDS]) {
    let mut root: Field = 0;
    let mut found: u32 = 0;
    let mut score: Field = 0;
    let mut kw_scores: [Field; MAX_WORDS] = [0; MAX_WORDS]; //score for every keyword

    // create expected bitmask from keyword positions
    let mut expected_mask: [u32; MASK_WORDS] = [0; MASK_WORDS];
    for i in 0..MAX_WORDS {
        if i < keyword_count {
            let pos = keyword_positions[i];
            // Verify position is valid
            assert(pos < word_count);
            kw_scores[i] = get_weight(tag_ids[pos]);
            // Set the corresponding bit in expected bitmask
            let word_idx = pos / 32;
            let bit_idx = pos % 32;
            expected_mask[word_idx] |= 1 << bit_idx;
        }
    }

    // Verify bitmask matches the expected bitmask from positions
    for i in 0..MASK_WORDS {
        assert(is_keyword[i] == expected_mask[i]);
    }

    for i in 0..MAX_WORDS {
        if i < word_count {
            let word_idx = i / 32;
            let bit_idx = i % 32;
            if ((is_keyword[word_idx] >> bit_idx) & 1) == 1 {
                // if keyword calculate weight and then add to score to root
                found += 1;
                // Calculate score from tag id
                let weight = get_weight(tag_ids[i]);
                score += weight;
                // H(root, H(word_hash, weight))
                let word_score_hash = std::hash::pedersen_hash([word_hashes[i], weight]);
                root = std::hash::pedersen_hash([root, word_score_hash]);
            } else {
                // Chunk not calculate weight
                root = std::hash::pedersen_hash([root, word_hashes[i]]);
            }
        }
    }

    // Verify we found exactly the number of keywords claimed
    assert(found == keyword_count);

    // Verify no bits are set beyond word_count
    for i in 0..MASK_WORDS {
        let wc = word_count;
        let lower = i * 32; //i=1 32-63
        let upper = (i + 1) * 32;

        let mut allowed: u32 = 0xFFFFFFFF;
        if wc <= lower {
            allowed = 0;
        } else if wc < upper {
            allowed = (1 << (wc - lower)) - 1;
        }
        assert((is_keyword[i] & !allowed) == 0);
    }

    // Return the calculated root, total_score and score for every word as public outputs
    (root, score, kw_scores)
}

#[test]
fn test_basic_score_calculation() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];

    w[0] = 0xc1;
    tags[0] = 0;
    w[1] = 0x1111;
    tags[1] = 1; // title -> weight 12
    w[2] = 0xc2;
    tags[2] = 0;
    w[3] = 0x1111;
    tags[3] = 2; // h1   -> weight 10
    w[4] = 0xc3;
    tags[4] = 0;

    kw_pos[0] = 1;
    kw_pos[1] = 3;

    let mut is_kw: [u32; MASK_WORDS] = [0; MASK_WORDS];
    is_kw[0] = 0x0000000A;

    let r0 = std::hash::pedersen_hash([0, w[0]]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 12]);
    let r1 = std::hash::pedersen_hash([r0, word_score_1]);
    let r2 = std::hash::pedersen_hash([r1, w[2]]);
    let word_score_2 = std::hash::pedersen_hash([w[3], 10]);
    let r3 = std::hash::pedersen_hash([r2, word_score_2]);
    let expected_root = std::hash::pedersen_hash([r3, w[4]]);

    let expected_score: Field = 22;

    let mut expected_kw_scores = [0; MAX_WORDS];
    expected_kw_scores[0] = 12;
    expected_kw_scores[1] = 10;

    let result = main(2, is_kw, kw_pos, w, tags, 5);
    let out_root = result.0;
    let out_score = result.1;
    let out_kw_scores = result.2;

    assert(out_root == expected_root);
    assert(out_score == expected_score);
    assert(out_kw_scores[0] == expected_kw_scores[0]);
    assert(out_kw_scores[1] == expected_kw_scores[1]);
}
