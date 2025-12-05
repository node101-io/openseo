use dep::std;
global MAX_CHUNKS: u32 = 32;

fn main(
    keyword_hash: Field,
    merkle_root: pub Field,
    leaf_hashes: [Field; MAX_CHUNKS],
    is_keyword: [u32; MAX_CHUNKS],
    chunk_count: u32,
    expected_occurrences: pub u32
) {
    let mut layer = leaf_hashes;
    let mut size = chunk_count;
    for _level in 0..6 {
        let mut next = [0; MAX_CHUNKS];
        let mut idx = 0;
        let pairs = size / 2;
        for i in 0..32 {
            let should_process = i < pairs;
            if should_process {
                let left = layer[i * 2];
                let right = if (i * 2 + 1) < size { layer[i * 2 + 1] } else { left };
                next[idx] = std::hash::pedersen_hash([left, right]);
                idx += 1;
            }
        }
        if size % 2 == 1 {
            let last_value = layer[size - 1];
            next[idx] = std::hash::pedersen_hash([last_value, last_value]);
            idx += 1;
        }
        layer = next;
        size = idx;
    }
    assert(layer[0] == merkle_root);
    let mut found = 0;
    for i in 0..MAX_CHUNKS {
        let is_in_range = i < chunk_count;
        let is_kw = is_keyword[i] == 1u32;
        if is_in_range {
            if is_kw {
                assert(leaf_hashes[i] == keyword_hash);
                found += 1;
            }
        }
    }
    assert(found == expected_occurrences);
}

#[test]
fn test_teleportation_tree() {
    let keyword_hash = 0x0857c95b;
    let mut leaf_hashes = [0; MAX_CHUNKS];
    let mut is_keyword = [0; MAX_CHUNKS];
    
    leaf_hashes[0] = keyword_hash;
    is_keyword[0] = 1;
    leaf_hashes[1] = 0x12345678;
    is_keyword[1] = 0;
    leaf_hashes[2] = keyword_hash;
    is_keyword[2] = 1;
    let pair1 = std::hash::pedersen_hash([leaf_hashes[0], leaf_hashes[1]]);
    let pair2 = std::hash::pedersen_hash([leaf_hashes[2], leaf_hashes[2]]);
    let merkle_root = std::hash::pedersen_hash([pair1, pair2]);
    
    main(keyword_hash, merkle_root, leaf_hashes, is_keyword, 3, 2);
}