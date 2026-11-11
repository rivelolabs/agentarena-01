// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ClashEscrow.sol";

contract ClashEscrowTest is Test {
    ClashEscrow escrow;
    address oracle = address(0xA11CE);
    address treasury = address(0x7EA5);
    address alice = address(0xA);
    address bob = address(0xB);
    bytes16 id = bytes16(keccak256("match-1"));

    function setUp() public {
        escrow = new ClashEscrow(oracle, treasury, 500);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _open() internal {
        vm.prank(alice);
        escrow.createMatch{value: 1 ether}(id);
        vm.prank(bob);
        escrow.joinMatch{value: 1 ether}(id);
    }

    function testWinnerPaidMinusFee() public {
        _open();
        vm.prank(oracle);
        escrow.settle(id, ClashEscrow.Outcome.PlayerB);
        assertEq(escrow.balances(bob), 1.9 ether);
        assertEq(escrow.balances(treasury), 0.1 ether);
        uint256 before = bob.balance;
        vm.prank(bob);
        escrow.withdraw();
        assertEq(bob.balance - before, 1.9 ether);
    }

    function testDrawRefundsBoth() public {
        _open();
        vm.prank(oracle);
        escrow.settle(id, ClashEscrow.Outcome.Draw);
        assertEq(escrow.balances(alice), 1 ether);
        assertEq(escrow.balances(bob), 1 ether);
    }

    function testOnlyOracleSettles() public {
        _open();
        vm.prank(alice);
        vm.expectRevert(ClashEscrow.NotOracle.selector);
        escrow.settle(id, ClashEscrow.Outcome.PlayerA);
    }

    function testWrongStakeRejected() public {
        vm.prank(alice);
        escrow.createMatch{value: 1 ether}(id);
        vm.prank(bob);
        vm.expectRevert(ClashEscrow.WrongStake.selector);
        escrow.joinMatch{value: 0.5 ether}(id);
    }

    function testNoSelfMatch() public {
        vm.prank(alice);
        escrow.createMatch{value: 1 ether}(id);
        vm.prank(alice);
        vm.expectRevert(ClashEscrow.SelfMatch.selector);
        escrow.joinMatch{value: 1 ether}(id);
    }

    function testCancelBeforeJoin() public {
        vm.prank(alice);
        escrow.createMatch{value: 1 ether}(id);
        vm.prank(alice);
        escrow.cancelMatch(id);
        assertEq(escrow.balances(alice), 1 ether);
    }

    function testRefundAfterTimeout() public {
        _open();
        vm.expectRevert(ClashEscrow.NotExpired.selector);
        escrow.refundExpired(id);
        vm.warp(block.timestamp + 1 hours + 1);
        escrow.refundExpired(id);
        assertEq(escrow.balances(alice), 1 ether);
        assertEq(escrow.balances(bob), 1 ether);
    }

    function testCannotSettleTwice() public {
        _open();
        vm.startPrank(oracle);
        escrow.settle(id, ClashEscrow.Outcome.PlayerA);
        vm.expectRevert(ClashEscrow.NotActive.selector);
        escrow.settle(id, ClashEscrow.Outcome.PlayerB);
        vm.stopPrank();
    }
}
