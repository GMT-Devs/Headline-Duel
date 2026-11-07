// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Headline Duel
/// @notice Two versions. One winner. One vote per wallet, with the AI's guess
///         locked on-chain before anyone votes. No tokens, no payments.
contract HeadlineDuel {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    struct Duel {
        address creator;
        string question;
        uint8 category; // 0 Headline · 1 Tagline · 2 Ad · 3 Email subject · 4 Name · 5 Image
        string a; // text, or IPFS CID when isImage
        string b;
        bool isImage;
        uint8 aiPick; // 0 none · 1 A · 2 B
        uint8 aiConfidence; // 0 none · 1 low · 2 medium · 3 high
        bytes32 aiReasonHash; // keccak256(bytes(aiReason))
        uint64 endsAt;
        uint32 votesA;
        uint32 votesB;
        uint64 createdBlock;
        bool ended; // ended early by the creator
        bool hidden; // hidden by the curator
    }

    // Byte limits (front-end enforces character limits; UTF-8 can use up to 4 bytes/char).
    uint256 public constant MAX_QUESTION_BYTES = 400; // ~100 chars
    uint256 public constant MAX_VERSION_BYTES = 560; // ~140 chars (CIDs are ~59)
    uint256 public constant MAX_REASON_BYTES = 560; // ~140 chars
    uint256 public constant MAX_AI_REASON_BYTES = 1000;
    uint8 public constant CATEGORY_COUNT = 6;

    uint8 public constant WINNER_NONE = 0; // still live
    uint8 public constant WINNER_A = 1;
    uint8 public constant WINNER_B = 2;
    uint8 public constant WINNER_DRAW = 3;

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    Duel[] internal duels; // read via getDuel / getDuels (a public getter for a 15-field struct is "stack too deep")
    mapping(uint256 => mapping(address => uint8)) public voteOf; // 0 none · 1 A · 2 B
    mapping(address => uint256[]) internal createdBy;
    mapping(address => uint256[]) internal votedBy;
    address public curator;
    uint256 public totalVotes;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event DuelStarted(uint256 indexed id, address indexed creator, uint8 aiPick, string aiReason);
    event Voted(uint256 indexed id, address indexed voter, uint8 choice, string reason);
    event DuelEnded(uint256 indexed id);
    event DuelHidden(uint256 indexed id, bool hidden);
    event Reported(uint256 indexed id, address indexed reporter, string reason);
    event CuratorChanged(address indexed curator);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error NotFound();
    error NotCreator();
    error NotCurator();
    error InvalidInput(string field);
    error NotLive();
    error AlreadyVoted();
    error CreatorCannotVote();

    constructor() {
        curator = msg.sender;
        emit CuratorChanged(msg.sender);
    }

    modifier exists(uint256 id) {
        if (id >= duels.length) revert NotFound();
        _;
    }

    // ------------------------------------------------------------------
    // Writes
    // ------------------------------------------------------------------

    /// @notice Start a duel. The AI pick and the hash of its reason are locked
    ///         here, before any vote can exist. The reason text is emitted in
    ///         `DuelStarted` and its hash is computed on-chain so they always match.
    /// @param duration 1 day, 3 days or 7 days, in seconds.
    function startDuel(
        string memory question,
        uint8 category,
        string memory a,
        string memory b,
        bool isImage,
        uint8 aiPick,
        uint8 aiConfidence,
        string memory aiReason,
        uint64 duration
    ) external returns (uint256 id) {
        uint256 qLen = bytes(question).length;
        if (qLen == 0 || qLen > MAX_QUESTION_BYTES) revert InvalidInput("question");
        if (category >= CATEGORY_COUNT) revert InvalidInput("category");
        if (bytes(a).length == 0 || bytes(a).length > MAX_VERSION_BYTES) revert InvalidInput("a");
        if (bytes(b).length == 0 || bytes(b).length > MAX_VERSION_BYTES) revert InvalidInput("b");
        if (keccak256(bytes(a)) == keccak256(bytes(b))) revert InvalidInput("identical");
        if (aiPick > 2) revert InvalidInput("aiPick");
        if (aiConfidence > 3) revert InvalidInput("aiConfidence");
        if (aiPick == 0 && (aiConfidence != 0 || bytes(aiReason).length != 0)) revert InvalidInput("ai");
        if (bytes(aiReason).length > MAX_AI_REASON_BYTES) revert InvalidInput("aiReason");
        if (duration != 1 days && duration != 3 days && duration != 7 days) revert InvalidInput("duration");

        id = duels.length;
        duels.push();
        Duel storage d = duels[id];
        d.creator = msg.sender;
        d.question = question;
        d.category = category;
        d.a = a;
        d.b = b;
        d.isImage = isImage;
        d.aiPick = aiPick;
        d.aiConfidence = aiConfidence;
        d.aiReasonHash = aiPick == 0 ? bytes32(0) : keccak256(bytes(aiReason));
        d.endsAt = uint64(block.timestamp) + duration;
        d.createdBlock = uint64(block.number);

        createdBy[msg.sender].push(id);
        emit DuelStarted(id, msg.sender, aiPick, aiReason);
    }

    /// @param choice 1 = A, 2 = B
    function vote(uint256 id, uint8 choice, string calldata reason) external exists(id) {
        Duel storage d = duels[id];
        if (!_isLive(d) || d.hidden) revert NotLive();
        if (msg.sender == d.creator) revert CreatorCannotVote();
        if (voteOf[id][msg.sender] != 0) revert AlreadyVoted();
        if (choice != 1 && choice != 2) revert InvalidInput("choice");
        if (bytes(reason).length > MAX_REASON_BYTES) revert InvalidInput("reason");

        voteOf[id][msg.sender] = choice;
        if (choice == 1) d.votesA += 1;
        else d.votesB += 1;
        totalVotes += 1;
        votedBy[msg.sender].push(id);
        emit Voted(id, msg.sender, choice, reason);
    }

    function endEarly(uint256 id) external exists(id) {
        Duel storage d = duels[id];
        if (msg.sender != d.creator) revert NotCreator();
        if (!_isLive(d)) revert NotLive();
        d.ended = true;
        d.endsAt = uint64(block.timestamp);
        emit DuelEnded(id);
    }

    function setHidden(uint256 id, bool hidden) external exists(id) {
        if (msg.sender != curator) revert NotCurator();
        duels[id].hidden = hidden;
        emit DuelHidden(id, hidden);
    }

    /// @notice Flag a duel for the curator. Cheap: event only.
    function report(uint256 id, string calldata reason) external exists(id) {
        if (bytes(reason).length > MAX_REASON_BYTES) revert InvalidInput("reason");
        emit Reported(id, msg.sender, reason);
    }

    function setCurator(address next) external {
        if (msg.sender != curator) revert NotCurator();
        if (next == address(0)) revert InvalidInput("curator");
        curator = next;
        emit CuratorChanged(next);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function duelCount() external view returns (uint256) {
        return duels.length;
    }

    function getDuel(uint256 id) external view exists(id) returns (Duel memory) {
        return duels[id];
    }

    /// @notice Page through duels in id order. Clamps to the array length.
    function getDuels(uint256 from, uint256 count) external view returns (Duel[] memory page) {
        uint256 len = duels.length;
        if (from >= len) return new Duel[](0);
        uint256 end = from + count;
        if (end > len) end = len;
        page = new Duel[](end - from);
        for (uint256 i = from; i < end; i++) page[i - from] = duels[i];
    }

    function hasVoted(uint256 id, address addr) external view returns (bool) {
        return voteOf[id][addr] != 0;
    }

    function isLive(uint256 id) external view exists(id) returns (bool) {
        return _isLive(duels[id]);
    }

    /// @return 0 live · 1 A · 2 B · 3 draw
    function winner(uint256 id) public view exists(id) returns (uint8) {
        return _winner(duels[id]);
    }

    function duelsOf(address addr) external view returns (uint256[] memory created, uint256[] memory voted) {
        return (createdBy[addr], votedBy[addr]);
    }

    /// @notice Site-wide stats. `aiFinished` counts finished, visible duels that
    ///         had an AI pick and a non-draw result; `aiCorrect` of those the AI got right.
    function stats() external view returns (uint256 duelTotal, uint256 voteTotal, uint256 aiCorrect, uint256 aiFinished) {
        duelTotal = duels.length;
        voteTotal = totalVotes;
        for (uint256 i = 0; i < duelTotal; i++) {
            Duel storage d = duels[i];
            if (d.hidden || d.aiPick == 0) continue;
            uint8 w = _winner(d);
            if (w == WINNER_A || w == WINNER_B) {
                aiFinished++;
                if (w == d.aiPick) aiCorrect++;
            }
        }
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _isLive(Duel storage d) internal view returns (bool) {
        return !d.ended && block.timestamp < d.endsAt;
    }

    function _winner(Duel storage d) internal view returns (uint8) {
        if (_isLive(d)) return WINNER_NONE;
        if (d.votesA > d.votesB) return WINNER_A;
        if (d.votesB > d.votesA) return WINNER_B;
        return WINNER_DRAW;
    }
}
