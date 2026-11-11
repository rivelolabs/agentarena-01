// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ClashEscrow.sol";

/// forge script script/Deploy.s.sol --rpc-url $POLYGON_RPC_URL --broadcast --verify
contract Deploy is Script {
    function run() external {
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(500)));
        vm.startBroadcast();
        ClashEscrow escrow = new ClashEscrow(oracle, treasury, feeBps);
        vm.stopBroadcast();
        console.log("ClashEscrow deployed at", address(escrow));
    }
}
