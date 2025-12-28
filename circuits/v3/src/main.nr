use dep::std;
global MAX_WORDS: u32 = 32;

fn main(
    keyword_count: u32, // number of keywords
    is_keyword: [u32; MAX_WORDS], // 1 if word is keyword, 0 otherwise for each word
    word_hashes: [Field; MAX_WORDS], // hashes of words(chunk+keyword)
    word_count: u32, // number of words(chunk+keyword)
    html_root: pub Field // root of the html tree
) {
    let mut root: Field = 0; // root of the html tree
    let mut found: u32 = 0; // number of keywords found
    
    for i in 0..MAX_WORDS {
        if i < word_count {
            // is_keyword[i] == 1 -> keyword, otherwise chunk
            if is_keyword[i] == 1 {
                found += 1;
            }
            // hash everyword
            root = std::hash::pedersen_hash([root, word_hashes[i]]);
        }
    }
    
    assert(root == html_root);  
    assert(found == keyword_count);
}

fn calc_root(h: [Field; MAX_WORDS], n: u32) -> Field {
    let mut r: Field = 0;
    for i in 0..MAX_WORDS { if i < n { r = std::hash::pedersen_hash([r, h[i]]); } }
    r
}

#[test]
fn test_multiple_keywords() { // 3 keywords at positions 1, 3, 6
    let mut w = [0; MAX_WORDS];
    let mut is_kw = [0; MAX_WORDS];
    for i in 0..8 { w[i] = i as Field + 100; }
    w[1] = 0x1111; is_kw[1] = 1;
    w[3] = 0x2222; is_kw[3] = 1;
    w[6] = 0x3333; is_kw[6] = 1;
    main(3, is_kw, w, 8, calc_root(w, 8));
}