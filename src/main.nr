global MAX_CHARS: u32 = 2048;
global MAX_KEYWORD_LENGTH: u32 = 32;
global MAX_MATCHES: u32 = 128;

fn main(
    expected_score: pub u32,
    document_chars: [Field; MAX_CHARS],
    document_length: Field,
    keyword_chars: [Field; MAX_KEYWORD_LENGTH],
    keyword_length: Field,
    match_indices: [u32; MAX_MATCHES],
    index_count: Field,
) {
    let doc_len: u32 = document_length as u32;
    assert(doc_len <= MAX_CHARS, "document_length exceeds MAX_CHARS");

    let kw_len: u32 = keyword_length as u32;
    assert(kw_len > 0, "keyword cannot be empty");
    assert(kw_len <= MAX_KEYWORD_LENGTH, "keyword_length exceeds MAX_KEYWORD_LENGTH");
    
    let ic: u32 = index_count as u32;
    assert(ic <= MAX_MATCHES, "index_count exceeds MAX_MATCHES");
    
    let mut verified_matches: u32 = 0;
    for i in 0..MAX_MATCHES {
        if i < ic {
            let start: u32 = match_indices[i];
            assert(start < doc_len, "match index out of range");
            assert(start + kw_len <= doc_len, "match runs past document end");

            for j in 0..MAX_KEYWORD_LENGTH {
                if j < kw_len {
                    let doc_char: Field = document_chars[start + j];
                    let kw_char: Field = keyword_chars[j];
                    assert(doc_char == kw_char, "character mismatch");
                }
            }
            verified_matches += 1;
        }
    }
    assert(verified_matches == expected_score, "score mismatch");
}

#[test]
fn test_meta_tag_keyword_matching() {
    //seo hello seo
    let mut doc: [Field; MAX_CHARS] = [0; MAX_CHARS];
    //words ascii values
    doc[0] = 115; 
    doc[1] = 101;  
    doc[2] = 111;  
    doc[3] = 32;   
    doc[4] = 104;  
    doc[5] = 101; 
    doc[6] = 108;  
    doc[7] = 108;  
    doc[8] = 111;  
    doc[9] = 32;   
    doc[10] = 115; 
    doc[11] = 101; 
    doc[12] = 111; 

    let mut keyword: [Field; MAX_KEYWORD_LENGTH] = [0; MAX_KEYWORD_LENGTH];
    //searched word: seo 
    keyword[0] = 115; 
    keyword[1] = 101; 
    keyword[2] = 111;

    let mut indices: [u32; MAX_MATCHES] = [0; MAX_MATCHES];
    indices[0] = 0;   
    indices[1] = 10;  

    main(2, doc, 13, keyword, 3, indices, 2);
}
