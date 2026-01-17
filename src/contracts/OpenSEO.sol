//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract OpenSEO {
    uint256 public constant VERIFICATION_TIMEOUT = 300;
    uint256 public constant REQUIRED_CONSENSUS = 2;

    mapping(address => bool) public authorizedNodes;

    struct VerificationRequest {
        address owner;
        uint256 timestamp;
        uint256 paymentAmount;
        bool isProcessed;
        string cid; 
        bytes32 resultRoot; 
    }

    //her bir node dan gelen root 
    struct Vote {
        address node;
        bytes32 root;
    }

    //VerificationRequest[] public requests;
    mapping(uint256 => VerificationRequest[]) public requests; 
    mapping(string => uint256) public cidToRequestID; //"Qm1212"->1,"Qm1231"->2 
    mapping(uint256 => Vote[]) public requestVotes; //her bir request için kim hangi oyu(node=root) attı 
    
    event VerificationRequested(uint256 indexed requestId, string cid, string[] keywords, address owner);
    event RequestCompleted(uint256 indexed requestId, bool success);

    modifier authNodes() {
        require(authorizedNodes[msg.sender], "Unauthorized");
        _;
    }

    constructor(address[3] memory _nodes) {
        for(uint i=0; i<3; i++) {
            authorizedNodes[_nodes[i]] = true;
        }
    }

    function submitRequest(string calldata cid, string[] calldata keywords ) external payable {
        require(msg.value>0, "Payment amount required");
        require(cidToRequestID[cid] == 0 || requests[cidToRequestID[cid] -1].isProcessed, "No active request");
        //"Qm1212"->1

        uint256 reqID = requests.length;
        requests.push(VerificationRequest({
            owner: msg.sender,
            timestamp: block.timestamp,
            paymentAmount: msg.value,
            isProcessed: false,
            cid: cid,
            resultRoot: bytes32(0)
        }));
        //0, 1, 2
        //1, 2, 3

        cidToRequestID[cid] = reqID + 1; 
        emit VerificationRequested(reqID, cid, keywords, msg.sender);
    }

    function submitHtmlRoot(string calldata cid, bytes32 htmlRoot) external authNodes{
        uint256 id = cidToRequestID[cid];
        require(id > 0, "Request not found"); 
        uint256 reqID = id - 1;

        VerificationRequest storage request = requests[reqID];
        require(!request.isProcessed, "Request processed");

        //timeout olursa ownera iade
        if(block.timestamp > request.timestamp + VERIFICATION_TIMEOUT) {
            request.isProcessed = true;
            payable(request.owner).transfer(request.paymentAmount);
            emit RequestCompleted(reqID, false);
            return;
        }

        //aynı node aynı root u birden fazla verify etmemeli
        Vote[] storage votes = requestVotes[reqID];
        for(uint i=0; i<votes.length; i++) {
            require(votes[i].node != msg.sender, "Voted");
        }
        votes.push(Vote({node:msg.sender, root: htmlRoot}));

        //Consensus daha efficient bul 
        uint256 matchCount = 0; 
        for(uint i=0; i<votes.length; i++) {
            if(votes[i].root == htmlRoot) {
                matchCount++;
            }
        }

        //consensus okey
        if(matchCount >= REQUIRED_CONSENSUS) {
            request.isProcessed = true;
            request.resultRoot = htmlRoot;

            //node payment
            uint256 payPerNode = request.paymentAmount / matchCount;
            for(uint i=0; i<votes.length; i++) {
                if(votes[i].root == htmlRoot) {
                    payable(votes[i].node).transfer(payPerNode);
                }
            }
            emit RequestCompleted(reqID, true);
        }
    }

    function getRequestDetails(uint256 reqID) external view returns (
        address owner,
        uint256 timestamp,
        bool isProcessed,
        string memory cid,
        bytes32 resultRoot
    ) {
        VerificationRequest memory request = requests[reqID];
        return (request.owner, request.timestamp, request.isProcessed, request.cid, request.resultRoot);
    }
}