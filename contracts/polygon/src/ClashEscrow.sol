// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ClashEscrow
/// @notice Trustless 1v1 wager escrow for ClashAgent AI battles on Polygon (or any EVM chain).
/// @dev Mirrors the Solana `clash_escrow` program:
///      create → join → settle (oracle) | cancel (creator, before join) | refundExpired (anyone, after timeout).
///      Payouts use the pull pattern (`withdraw`) so a reverting receiver can never block settlement.
contract ClashEscrow {
    enum Status { None, Open, Active, Settled, Cancelled }
    enum Outcome { PlayerA, PlayerB, Draw }

    struct Match {
        address playerA;
        address playerB;
        uint128 stake;
        uint40 createdAt;
        uint40 joinedAt;
        Status status;
    }

    uint16 public constant MAX_FEE_BPS = 1_000; // 10%
    uint40 public constant SETTLE_TIMEOUT = 1 hours;

    address public admin;
    address public oracle;
    address public treasury;
    uint16 public feeBps;
    bool public paused;

    mapping(bytes16 => Match) public matches;
    mapping(address => uint256) public balances;

    uint256 private _locked = 1;

    event MatchCreated(bytes16 indexed matchId, address indexed playerA, uint256 stake);
    event MatchJoined(bytes16 indexed matchId, address indexed playerB);
    event MatchSettled(bytes16 indexed matchId, Outcome outcome, uint256 prize, uint256 fee);
    event MatchCancelled(bytes16 indexed matchId);
    event MatchRefunded(bytes16 indexed matchId);
    event Withdrawn(address indexed account, uint256 amount);
    event ConfigUpdated(address oracle, address treasury, uint16 feeBps, bool paused);

    error NotAdmin();
    error NotOracle();
    error Paused();
    error ZeroStake();
    error AlreadyExists();
    error NotOpen();
    error NotActive();
    error WrongStake();
    error SelfMatch();
    error NotCreator();
    error NotExpired();
    error FeeTooHigh();
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address _oracle, address _treasury, uint16 _feeBps) {
        if (_oracle == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        admin = msg.sender;
        oracle = _oracle;
        treasury = _treasury;
        feeBps = _feeBps;
    }

    // ------------------------------------------------------------------ admin

    function updateConfig(address _oracle, address _treasury, uint16 _feeBps, bool _paused) external onlyAdmin {
        if (_oracle == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        oracle = _oracle;
        treasury = _treasury;
        feeBps = _feeBps;
        paused = _paused;
        emit ConfigUpdated(_oracle, _treasury, _feeBps, _paused);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ---------------------------------------------------------------- players

    /// @notice Open a match by locking `msg.value` as the stake.
    function createMatch(bytes16 matchId) external payable {
        if (paused) revert Paused();
        if (msg.value == 0) revert ZeroStake();
        if (matches[matchId].status != Status.None) revert AlreadyExists();
        matches[matchId] = Match({
            playerA: msg.sender,
            playerB: address(0),
            stake: uint128(msg.value),
            createdAt: uint40(block.timestamp),
            joinedAt: 0,
            status: Status.Open
        });
        emit MatchCreated(matchId, msg.sender, msg.value);
    }

    /// @notice Join an open match by sending exactly the same stake.
    function joinMatch(bytes16 matchId) external payable {
        if (paused) revert Paused();
        Match storage m = matches[matchId];
        if (m.status != Status.Open) revert NotOpen();
        if (msg.sender == m.playerA) revert SelfMatch();
        if (msg.value != m.stake) revert WrongStake();
        m.playerB = msg.sender;
        m.joinedAt = uint40(block.timestamp);
        m.status = Status.Active;
        emit MatchJoined(matchId, msg.sender);
    }

    /// @notice Creator can withdraw an unjoined match.
    function cancelMatch(bytes16 matchId) external {
        Match storage m = matches[matchId];
        if (m.status != Status.Open) revert NotOpen();
        if (msg.sender != m.playerA) revert NotCreator();
        m.status = Status.Cancelled;
        balances[m.playerA] += m.stake;
        emit MatchCancelled(matchId);
    }

    /// @notice If the oracle never settles, anyone can refund both players after the timeout.
    function refundExpired(bytes16 matchId) external {
        Match storage m = matches[matchId];
        if (m.status != Status.Active) revert NotActive();
        if (block.timestamp < uint256(m.joinedAt) + SETTLE_TIMEOUT) revert NotExpired();
        m.status = Status.Cancelled;
        balances[m.playerA] += m.stake;
        balances[m.playerB] += m.stake;
        emit MatchRefunded(matchId);
    }

    // ----------------------------------------------------------------- oracle

    /// @notice Report the battle result. The oracle can only choose A, B or draw.
    function settle(bytes16 matchId, Outcome outcome) external {
        if (msg.sender != oracle) revert NotOracle();
        Match storage m = matches[matchId];
        if (m.status != Status.Active) revert NotActive();
        m.status = Status.Settled;

        uint256 stake = m.stake;
        if (outcome == Outcome.Draw) {
            balances[m.playerA] += stake;
            balances[m.playerB] += stake;
            emit MatchSettled(matchId, outcome, 0, 0);
            return;
        }
        uint256 pot = stake * 2;
        uint256 fee = (pot * feeBps) / 10_000;
        uint256 prize = pot - fee;
        address winner = outcome == Outcome.PlayerA ? m.playerA : m.playerB;
        balances[winner] += prize;
        if (fee > 0) balances[treasury] += fee;
        emit MatchSettled(matchId, outcome, prize, fee);
    }

    // --------------------------------------------------------------- payouts

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }
}
