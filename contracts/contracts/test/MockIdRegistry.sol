// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockIdRegistry {
    mapping(uint256 => address) public owners;
    mapping(address => uint256) public fids;

    function setAddressForFid(uint256 fid, address owner) external {
        owners[fid] = owner;
    }

    function setFidForAddress(address owner, uint256 fid) external {
        fids[owner] = fid;
    }

    function custodyOf(uint256 fid) external view returns (address) {
        return owners[fid];
    }

    function idOf(address owner) external view returns (uint256) {
        return fids[owner];
    }
}
