use dep::std;
global MAX_WORDS: u32 = 32;

fn main(
    keyword_count: u32, // number of keywords
    is_keyword: u32, // bit i is 1 if word i is keyword, 0 otherwise
    keyword_positions: [u32; MAX_WORDS], // positions where keywords are located (0-indexed)
    word_hashes: [Field; MAX_WORDS], // hashes of words(chunk+keyword)
    word_count: u32, // number of words(chunk+keyword)
    html_root: pub Field // root of the html tree
) {
    let mut root: Field = 0; // root of the html tree
    let mut found: u32 = 0; // number of keywords found
    
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
            // Check if bit i is set in the bitmask
            if ((is_keyword >> i) & 1) == 1 {
                found += 1;
            }
            // hash everyword
            root = std::hash::pedersen_hash([root, word_hashes[i]]);
        }
    }
    
    assert(root == html_root);  
    assert(found == keyword_count);
    let mask = (1 << word_count) - 1; 
    assert((is_keyword & !mask) == 0); 
}

#[test]
fn test_multiple_keywords() {
    // 7 words: 3 keywords, 4 chunks
    // bitmask: bits 1 3 5 000101010 -> 42
    let mut w = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0xc1;   // chunk
    w[1] = 0x1111; // keyword at position 1
    w[2] = 0xc2;   // chunk
    w[3] = 0x2222; // keyword at position 3
    w[4] = 0xc3;   // chunk
    w[5] = 0x3333; // keyword at position 5
    w[6] = 0xc4;   // chunk
    
    kw_pos[0] = 1; // first keyword at position 1
    kw_pos[1] = 3; // second keyword at position 3
    kw_pos[2] = 5; // third keyword at position 5
    
    let is_kw: u32 = 42;
    
    // H(H(H(H(H(H(H(0, c1), kw1), c2), kw2), c3), kw3), c4)
    let r0 = std::hash::pedersen_hash([0, w[0]]);
    let r1 = std::hash::pedersen_hash([r0, w[1]]);
    let r2 = std::hash::pedersen_hash([r1, w[2]]);
    let r3 = std::hash::pedersen_hash([r2, w[3]]);
    let r4 = std::hash::pedersen_hash([r3, w[4]]);
    let r5 = std::hash::pedersen_hash([r4, w[5]]);
    let root = std::hash::pedersen_hash([r5, w[6]]);
    
    main(3, is_kw, kw_pos, w, 7, root);
}

#[test]
fn test_keywords() {
    // 7 words: 4 keywords, 3 chunks
    // bitmask: bits 1 3 5 6 01101010 -> 106
    let mut w = [0; MAX_WORDS];
    let mut kw_pos = [0; MAX_WORDS];
    
    w[0] = 0xc1;   // chunk
    w[1] = 0x1111; // keyword at position 1
    w[2] = 0xc2;   // chunk
    w[3] = 0x2222; // keyword at position 3
    w[4] = 0xc3;   // chunk
    w[5] = 0x3333; // keyword at position 5
    w[6] = 0x4444; // keyword at position 6
    
    kw_pos[0] = 1; // first keyword at position 1
    kw_pos[1] = 3; // second keyword at position 3
    kw_pos[2] = 5; // third keyword at position 5
    kw_pos[3] = 6; // fourth keyword at position 6
    
    // bitmask: bits 1, 3, 5, 6 are set
    // 2^1 + 2^3 + 2^5 + 2^6 = 2 + 8 + 32 + 64 = 106
    let is_kw: u32 = 106;
    
    // H(H(H(H(H(H(H(0, c1), kw1), c2), kw2), c3), kw3), kw4)
    let r0 = std::hash::pedersen_hash([0, w[0]]);
    let r1 = std::hash::pedersen_hash([r0, w[1]]);
    let r2 = std::hash::pedersen_hash([r1, w[2]]);
    let r3 = std::hash::pedersen_hash([r2, w[3]]);
    let r4 = std::hash::pedersen_hash([r3, w[4]]);
    let r5 = std::hash::pedersen_hash([r4, w[5]]);
    let root = std::hash::pedersen_hash([r5, w[6]]);
    
    main(4, is_kw, kw_pos, w, 7, root);
}