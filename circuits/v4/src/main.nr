use dep::std;
global MAX_WORDS: u32 = 32;

// tag_id: 0=default, 1=title, 2=h1, 3=h2, 4=h3, 5=h4, 6=h5, 7=h6, 8=meta, 9=strong, 10=b, 11=i, 12=a, 13=p, 14=span, 15=div, 16=li, 17=td, 18=th, 19=blockquote, 20=code
// tag id - weight
fn get_weight(tag_id: u32) -> Field {
    if tag_id == 1 { 12 }       // title 
    else if tag_id == 2 { 10 }  // h1
    else if tag_id == 3 { 8 }   // h2
    else if tag_id == 4 { 6 }   // h3
    else if tag_id == 5 { 5 }   // h4
    else if tag_id == 6 { 4 }   // h5
    else if tag_id == 7 { 3 }   // h6
    else if tag_id == 8 { 7 }   // meta
    else if tag_id == 9 { 5 }   // strong
    else if tag_id == 10 { 5 }  // b
    else if tag_id == 11 { 4 }  // i
    else if tag_id == 12 { 6 }  // a
    else if tag_id == 13 { 3 }  // p
    else if tag_id == 14 { 2 }  // span
    else if tag_id == 15 { 2 }  // div
    else if tag_id == 16 { 3 }  // li
    else if tag_id == 17 { 2 }  // td
    else if tag_id == 18 { 4 }  // th
    else if tag_id == 19 { 3 }  // blockquote
    else if tag_id == 20 { 3 }  // code
    else { 1 }                  // default
}

fn main(
    keyword_count: u32, // number of keywords
    is_keyword: u32, // bit i is 1 if word i is keyword, 0 otherwise
    keyword_positions: [u32; MAX_WORDS], // positions where keywords are located 
    word_hashes: [Field; MAX_WORDS], // hash of each item (chunk or keyword)
    tag_ids: [u32; MAX_WORDS],  // tag id for each word
    word_count: u32, // number of items (chunks and keywords)
    html_root: pub Field, // root of the html
    total_score: pub Field  // Total seo score
) {
    let mut root: Field = 0;
    let mut found: u32 = 0;
    let mut score: Field = 0;
    
    // create expected bitmask from keyword positions
    let mut expected_bitmask: u32 = 0;
    for i in 0..MAX_WORDS {
        if i < keyword_count {
            let pos = keyword_positions[i];
            // Verify position is valid
            assert(pos < word_count);
            // Set the corresponding bit in expected bitmask
            expected_bitmask |= (1 << pos);
        }
    }
    
    // Verify bitmask matches the expected bitmask from positions
    assert(is_keyword == expected_bitmask);
    
    for i in 0..MAX_WORDS {
        if i < word_count {
            if ((is_keyword >> i) & 1) == 1 { // if keyword calculate weight and then add to score to root
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
    
    assert(root == html_root);
    assert(found == keyword_count);
    assert(score == total_score);
    let mask: u32 = if word_count >= 32 { 0xFFFFFFFF } else { (1 << word_count) - 1 };
    assert((is_keyword & !mask) == 0);
}

#[test]
fn test_basic_score_calculation() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0xc1; tags[0] = 0;
    w[1] = 0x1111; tags[1] = 1;   // keyword in title (weight=12)
    w[2] = 0xc2; tags[2] = 0;
    w[3] = 0x1111; tags[3] = 2;   // keyword in h1 (weight=10)
    w[4] = 0xc3; tags[4] = 0;
    
    kw_pos[0] = 1; // first keyword at position 1
    kw_pos[1] = 3; // second keyword at position 3
    
    let is_kw: u32 = 10; // 0b00001010 - positions 1,3
    
    let r0 = std::hash::pedersen_hash([0, w[0]]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 12]);
    let r1 = std::hash::pedersen_hash([r0, word_score_1]);
    let word_score_2 = std::hash::pedersen_hash([w[3], 10]);
    let r2 = std::hash::pedersen_hash([r1, w[2]]);
    let r3 = std::hash::pedersen_hash([r2, word_score_2]);
    let root = std::hash::pedersen_hash([r3, w[4]]);
    
    main(2, is_kw, kw_pos, w, tags, 5, root, 22);
}

#[test]
fn test_single_keyword() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0x1234; tags[0] = 2; // h1 keyword
    kw_pos[0] = 0; // keyword at position 0
    let is_kw: u32 = 1; // 0b00000001 2^0=1
    
    let word_score_ = std::hash::pedersen_hash([w[0], 10]);
    let root = std::hash::pedersen_hash([0, word_score_]);
    
    main(1, is_kw, kw_pos, w, tags, 1, root, 10);
}

#[test]
fn test_no_keywords_only_chunks() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0xaaa; tags[0] = 0;
    w[1] = 0xbbb; tags[1] = 0;
    w[2] = 0xccc; tags[2] = 0;
    
    let is_kw: u32 = 0; // no keywords
    
    let r0 = std::hash::pedersen_hash([0, w[0]]);
    let r1 = std::hash::pedersen_hash([r0, w[1]]);
    let root = std::hash::pedersen_hash([r1, w[2]]);
    
    main(0, is_kw, kw_pos, w, tags, 3, root, 0);
}

#[test]
fn test_consecutive_keywords() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0x01; tags[0] = 1;   // title: 12
    w[1] = 0x02; tags[1] = 2;   // h1: 10
    w[2] = 0x03; tags[2] = 3;   // h2: 8
    
    kw_pos[0] = 0; // first keyword at position 0
    kw_pos[1] = 1; // second keyword at position 1
    kw_pos[2] = 2; // third keyword at position 2
    
    let is_kw: u32 = 7; // 0b00000111 - all three 2^0+2^1+2^2=7
    
    let word_score_0 = std::hash::pedersen_hash([w[0], 12]);
    let r0 = std::hash::pedersen_hash([0, word_score_0]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 10]);
    let r1 = std::hash::pedersen_hash([r0, word_score_1]);
    let word_score_2 = std::hash::pedersen_hash([w[2], 8]);
    let root = std::hash::pedersen_hash([r1, word_score_2]);
    
    main(3, is_kw, kw_pos, w, tags, 3, root, 30);
}


#[test(should_fail)]
fn test_wrong_bitmask_positions() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0xc1; tags[0] = 0;     // chunk
    w[1] = 0x1111; tags[1] = 1;   // keyword (title: 12)
    w[2] = 0xc2; tags[2] = 0;     // chunk
    w[3] = 0x2222; tags[3] = 2;   // keyword (h1: 10)
    
    kw_pos[0] = 1; // first keyword at position 1
    kw_pos[1] = 3; // second keyword at position 3
    
    // Correct bitmask = 10 (0b00001010) - positions 1,3
    // Wrong bitmask = 5 (0b00000101) - positions 0,2
    let wrong_bitmask: u32 = 5; // 0b00000101 (positions 0,2) but should be 10 (positions 1,3)
    
    // Calculate root hash with correct bitmask
    let r0 = std::hash::pedersen_hash([0, w[0]]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 12]);
    let r1 = std::hash::pedersen_hash([r0, word_score_1]);
    let r2 = std::hash::pedersen_hash([r1, w[2]]);
    let word_score_2 = std::hash::pedersen_hash([w[3], 10]);
    let root = std::hash::pedersen_hash([r2, word_score_2]);
    
    main(2, wrong_bitmask, kw_pos, w, tags, 4, root, 22);
}

#[test(should_fail)]
fn test_fake_high_score() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0xaaa; tags[0] = 14;  // span (2)
    kw_pos[0] = 0; // keyword at position 0
    let is_kw: u32 = 1;
    
    // Use correct weight for span tag 
    let word_score_ = std::hash::pedersen_hash([w[0], 12]); 
    let root = std::hash::pedersen_hash([0, word_score_]);
    
    main(1, is_kw, kw_pos, w, tags, 1, root, 2);
}

#[test]
fn test_keyword_afterward() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0x1111; tags[0] = 1;   //12
    w[1] = 0x1111; tags[1] = 2;   //10
    w[2] = 0x1111; tags[2] = 3;   //8
    
    kw_pos[0] = 0; // first keyword at position 0
    kw_pos[1] = 1; // second keyword at position 1
    kw_pos[2] = 2; // third keyword at position 2
    
    let is_kw: u32 = 7; // 0b00000111
    
    let word_score_0 = std::hash::pedersen_hash([w[0], 12]);
    let r0 = std::hash::pedersen_hash([0, word_score_0]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 10]);
    let r1 = std::hash::pedersen_hash([r0, word_score_1]);
    let word_score_2 = std::hash::pedersen_hash([w[2], 8]);
    let root = std::hash::pedersen_hash([r1, word_score_2]);
    
    main(3, is_kw, kw_pos, w, tags, 3, root, 30);
}


#[test(should_fail)]
fn test_wrong_keyword_count() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0x1111; tags[0] = 1;
    w[1] = 0x2222; tags[1] = 2;
    
    kw_pos[0] = 0; // first keyword at position 0
    kw_pos[1] = 1; // second keyword at position 1
    
    let is_kw: u32 = 3; // 2 keywords
    
    let word_score_0 = std::hash::pedersen_hash([w[0], 12]);
    let r0 = std::hash::pedersen_hash([0, word_score_0]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 10]);
    let root = std::hash::pedersen_hash([r0, word_score_1]);
    
    // Claim 3 ama 2 var
    main(3, is_kw, kw_pos, w, tags, 2, root, 22);
}

#[test(should_fail)]
fn test_wrong_total_score() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0x1111; tags[0] = 1;  // weight 12
    w[1] = 0x2222; tags[1] = 2;  // weight 10
    
    kw_pos[0] = 0; // first keyword at position 0
    kw_pos[1] = 1; // second keyword at position 1
    
    let is_kw: u32 = 3;
    
    let word_score_0 = std::hash::pedersen_hash([w[0], 12]);
    let r0 = std::hash::pedersen_hash([0, word_score_0]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 10]);
    let root = std::hash::pedersen_hash([r0, word_score_1]);
    
    main(2, is_kw, kw_pos, w, tags, 2, root, 30); //expected 22 
}

#[test(should_fail)]
fn test_hash_order() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0xaaa; tags[0] = 0; 
    w[1] = 0xbbb; tags[1] = 1;
    
    kw_pos[0] = 1; // keyword at position 1
    let is_kw: u32 = 2;
    
    let word_score_1 = std::hash::pedersen_hash([w[1], 12]);
    let r1 = std::hash::pedersen_hash([0, word_score_1]);
    let wrong_root = std::hash::pedersen_hash([r1, w[0]]);
    
    main(1, is_kw, kw_pos, w, tags, 2, wrong_root, 12); //first hash w0 then w1
}

#[test(should_fail)]
fn test_score_mismatch_with_correct_count() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0x1111; tags[0] = 1;  // title: 12
    
    kw_pos[0] = 0; // keyword at position 0
    let is_kw: u32 = 1;
    
    let word_score_ = std::hash::pedersen_hash([w[0], 12]);
    let root = std::hash::pedersen_hash([0, word_score_]);
    
    main(1, is_kw, kw_pos, w, tags, 1, root, 10); //expected 12
}

#[test(should_fail)]
fn test_missing_keyword_in_count() {
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0x1111; tags[0] = 1; //12
    w[1] = 0x2222; tags[1] = 2; //10
    w[2] = 0x3333; tags[2] = 3; //8
    
    kw_pos[0] = 0; // first keyword at position 0
    kw_pos[1] = 1; // second keyword at position 1
    kw_pos[2] = 2; // third keyword at position 2
    
    let is_kw: u32 = 7; // 2^0+2^1+2^2=7
    
    let word_score_0 = std::hash::pedersen_hash([w[0], 12]);
    let r0 = std::hash::pedersen_hash([0, word_score_0]);
    let word_score_1 = std::hash::pedersen_hash([w[1], 10]);
    let r1 = std::hash::pedersen_hash([r0, word_score_1]);
    let word_score_2 = std::hash::pedersen_hash([w[2], 8]);
    let root = std::hash::pedersen_hash([r1, word_score_2]);
    
    main(2, is_kw, kw_pos, w, tags, 3, root, 30); // keyword_count must be 3
}