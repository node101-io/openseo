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
    word_hashes: [Field; MAX_WORDS], // hash of each item (chunk or keyword)
    tag_ids: [u32; MAX_WORDS],  // tag id for each word
    word_count: u32, // number of items (chunks or keywords)
    html_root: pub Field, // root of the html
    total_score: pub Field  // Total seo score
) {
    let mut root: Field = 0;
    let mut found: u32 = 0;
    let mut score: Field = 0;
    
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
}

#[test]
fn test_score_calculation() {
    // bitmask: bits 1 3 00001010 -> 10
    let mut w = [0; MAX_WORDS];
    let mut tags = [0; MAX_WORDS];
    
    w[0] = 0xc1; tags[0] = 0;   // chunk
    w[1] = 0x1111; tags[1] = 1;   // keyword in title (weight=12)
    w[2] = 0xc2; tags[2] = 0;   // chunk
    w[3] = 0x1111; tags[3] = 2;   // keyword in h1 (weight=10)
    w[4] = 0xc3; tags[4] = 0;   // chunk

    let is_kw: u32 = 10;
    let r0 = std::hash::pedersen_hash([0, w[0]]);
    let ws1 = std::hash::pedersen_hash([w[1], 12]);
    let r1 = std::hash::pedersen_hash([r0, ws1]);
    let r2 = std::hash::pedersen_hash([r1, w[2]]);
    let ws2 = std::hash::pedersen_hash([w[3], 10]);
    let r3 = std::hash::pedersen_hash([r2, ws2]);
    let root = std::hash::pedersen_hash([r3, w[4]]);
    
    // total_score = 12 + 10 = 22
    main(2, is_kw, w, tags, 5, root, 22);
}