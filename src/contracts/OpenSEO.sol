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
        mapping(bytes32 => address[]) cidRootVotes; //"0xRootHash...": [Node1, Node2]
    }

    struct RequestResult {
        string cid; 
        bytes32 resultRoot; 
    }

    //her bir node dan gelen root 
    struct Vote {
        address node;
        bytes32 root;
    }

    mapping(string => RequestResult) public results; //if isProcessed true 
    mapping(string => VerificationRequest) public requests; 
    mapping(string => mapping(address => bool)) public hasVoted; //o mode un o cid için oy kullanıp kullanmadığı

    event VerificationRequested(string cid, string[] keywords, address owner);
    event RequestCompleted(string cid, bool success);

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
        VerificationRequest storage request = requests[cid];

        if (request.paymentAmount > 0) { 
             require(request.isProcessed, "Active request exists");
        }

        request.owner = msg.sender;
        request.timestamp = block.timestamp;
        request.paymentAmount = msg.value;
        request.isProcessed = false;

        emit VerificationRequested(cid, keywords, msg.sender);
    }

    function submitHtmlRoot(string calldata cid, bytes32 htmlRoot) external authNodes{
        VerificationRequest storage request = requests[cid];

        require(request.paymentAmount > 0, "Request not found"); 
        require(!request.isProcessed, "Request processed");
        require(!hasVoted[cid][msg.sender], "Voted"); //çifte oy kontrolü

        hasVoted[cid][msg.sender] = true;
        request.cidRootVotes[htmlRoot].push(msg.sender); //bu cid için bu root a oy verenlere ekle 
        uint256 matchVoteCount = request.cidRootVotes[htmlRoot].length;

        if(matchVoteCount >= REQUIRED_CONSENSUS) {
            request.isProcessed = true;
            results[cid] = RequestResult({cid:cid, resultRoot: htmlRoot});

            address[] memory winners = request.cidRootVotes[htmlRoot];
            uint256 payPerNode = request.paymentAmount / matchVoteCount;

            for(uint i=0; i < winners.length; i++) {
                payable(winners[i]).transfer(payPerNode);
            }

            emit RequestCompleted(cid, true);
        }
    }

    function claimRefund(string calldata cid) external {
        VerificationRequest storage request = requests[cid];
        
        require(request.paymentAmount > 0, "Not found");
        require(!request.isProcessed, "Already processed");
        require(block.timestamp > request.timestamp + VERIFICATION_TIMEOUT, "Wait timeout");
        require(msg.sender == request.owner, "Not owner"); 
        request.isProcessed = true;

        payable(request.owner).transfer(request.paymentAmount);
        emit RequestCompleted(cid, false); 
    }

    function getRequestDetails(string calldata cid) external view returns (
        string memory CID,
        bytes32 resultRoot
    ) {
        RequestResult memory result = results[cid];
        return (result.cid, result.resultRoot);
    } 

    function cleanIsNotProcessedRequest(string calldata cid) external authNodes(){
        VerificationRequest storage request = requests[cid];

        require(request.paymentAmount>0, "Request not found");
        require(!request.isProcessed, "Processed");
        require(block.timestamp > request.timestamp + VERIFICATION_TIMEOUT, "Not expired request verification time");
        delete requests[cid];
    }   
}