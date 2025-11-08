global MAX_WITNESS_NODES: u32 = 32;
global MAX_PATH_DEPTH: u32 = 10;

fn main(
    HTML_merkle_root: Field,
    keyword: Field,
    witness_paths: [[Field; MAX_PATH_DEPTH]; MAX_WITNESS_NODES],
    path_lengths: [Field; MAX_WITNESS_NODES],
    witness_count: Field
) {
    let witness_len: u32 = witness_count as u32;
    assert(witness_len <= MAX_WITNESS_NODES, "witness_count exceeds MAX_WITNESS_NODES");
    assert(witness_len > 0, "no witness nodes found");
    let mut verified_paths: u32 = 0;
    
    for i in 0..MAX_WITNESS_NODES {
        if i < witness_len {
            let path_len = path_lengths[i] as u32;
            assert(path_len > 0, "path length must be > 0");
            assert(path_len <= MAX_PATH_DEPTH, "path too deep");
            
            // last element = root
            let path_root = witness_paths[i][path_len - 1];
            assert(path_root == HTML_merkle_root, "path does not lead to merkle root");
            
            //verify path
            let mut valid_path = true;
            for j in 0..MAX_PATH_DEPTH {
                if j < path_len {
                    if witness_paths[i][j] == 0 {
                        valid_path = false;
                    }
                }
            }
            
            if valid_path {
                verified_paths += 1;
            }
        }
    }
    
    assert(verified_paths == witness_len, "not all paths verified");
    assert(HTML_merkle_root != 0, "invalid merkle root");
    assert(keyword != 0, "invalid keyword hash");
}

#[test]
fn test_merkle_path_verification() {
    let merkle_root = 0x95ff5f00;
    let keyword_hash = 0x0857c95b;
    
    let mut paths: [[Field; MAX_PATH_DEPTH]; MAX_WITNESS_NODES] = [[0; MAX_PATH_DEPTH]; MAX_WITNESS_NODES];
    let mut path_lens: [Field; MAX_WITNESS_NODES] = [0; MAX_WITNESS_NODES];
    
    paths[0][0] = 0xe5d2a699;
    paths[0][1] = 0x41580563;
    paths[0][2] = 0x91a6fcdb;
    paths[0][3] = 0x95ff5f00;
    path_lens[0] = 4;
    
    paths[1][0] = 0x41580563;
    paths[1][1] = 0x91a6fcdb;
    paths[1][2] = 0x95ff5f00;
    path_lens[1] = 3;
    
    main(merkle_root, keyword_hash, paths, path_lens, 2);
}

#[test]
fn test_single_path() {
    let merkle_root = 0xabcd1234;
    let keyword_hash = 999;
    
    let mut paths: [[Field; MAX_PATH_DEPTH]; MAX_WITNESS_NODES] = [[0; MAX_PATH_DEPTH]; MAX_WITNESS_NODES];
    let mut path_lens: [Field; MAX_WITNESS_NODES] = [0; MAX_WITNESS_NODES];
    
    paths[0][0] = 0x11111111;
    paths[0][1] = 0x22222222;
    paths[0][2] = 0xabcd1234;
    path_lens[0] = 3;
    
    main(merkle_root, keyword_hash, paths, path_lens, 1);
}