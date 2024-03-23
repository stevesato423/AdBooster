// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAdBooster {
    struct Ad {
        uint256 fid;
        uint256 amount;
        string ref;
    }

    event AdSlotBought(bytes32 indexed frameId, uint256 indexed slot, uint256 indexed fid, uint256 amount, string ref);
    event AdSlotsForSale(bytes32 indexed frameId, uint256 indexed fid);
    event RewardClaimed(
        bytes32 indexed frameId,
        uint256 indexed slot,
        uint256 indexed rewardedFid,
        uint256 rewarderFid,
        uint256 amount
    );

    error AdSlotNotOnSale();
    error AmountCannotBeZero();
    error AmountMustBeGreaterThanTheCurrentOne();
    error FailedToSendEth();
    error FidNotRegistered();
    error InvalidEncoding();
    error InvalidFrame();
    error InvalidMessageType();
    error InvalidSignature();
    error InvalidSlot();

    function buyAdSlot(bytes32 frameId, uint256 slot, string calldata ref) external payable;

    function claimRewardsByAdSlots(bytes calldata messageFrameCreation, uint256[] calldata slots) external payable;

    function getCurrentAdSlot() external view returns (uint256);

    function putAdSlotsOnSale(bytes32 publicKey, bytes32 r, bytes32 s, bytes memory message) external;

    function withdrawFees() external;
}
