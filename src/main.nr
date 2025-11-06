global MAX_WITNESS_NODES: u32 = 512;

fn main(
    HTML_merkle_root: Field,
    keyword: Field,
    witness_array: [Field; MAX_WITNESS_NODES],
    witness_count: Field
) {
    let witness_len: u32 = witness_count as u32;
    assert(witness_len <= MAX_WITNESS_NODES, "witness_count exceeds MAX_WITNESS_NODES");
    
    let mut verified_matches: u32 = 0;

    for i in 0..MAX_WITNESS_NODES {
        if i < witness_len {
            let witness_node = witness_array[i];
            
            if witness_node == keyword {
                verified_matches += 1;
            }
        }
    }
    assert(verified_matches > 0, "keyword not found in witness array");
    assert(HTML_merkle_root != 0, "invalid merkle root");
}

#[test]
fn test_keyword_found_in_witness() {
    let merkle_root = 12345;
    let keyword_hash = 999;
    
    let mut witness: [Field; MAX_WITNESS_NODES] = [0; MAX_WITNESS_NODES];
    witness[0] = 111;
    witness[1] = 222;
    witness[2] = 999; 
    witness[3] = 444;
    
    main(merkle_root, keyword_hash, witness, 4);
}

#[test]
fn test_multiple_keyword_matches() {
    let merkle_root = 12345;
    let keyword_hash = 777;
    
    let mut witness: [Field; MAX_WITNESS_NODES] = [0; MAX_WITNESS_NODES];
    witness[0] = 777;  
    witness[1] = 222;
    witness[2] = 777;  
    witness[3] = 444;
    witness[4] = 777;  
    
    main(merkle_root, keyword_hash, witness, 5);
}
