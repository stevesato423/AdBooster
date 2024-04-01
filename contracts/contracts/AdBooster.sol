// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MessageDataCodec, MessageData, MessageType, ReactionType } from "farcaster-solidity/contracts/protobufs/message.proto.sol";
import { Blake3 } from "farcaster-solidity/contracts/libraries/Blake3.sol";
import { Ed25519 } from "farcaster-solidity/contracts/libraries/Ed25519.sol";
import { IIdRegistry } from "./interfaces/IIdRegistry.sol";
import { IAdBooster } from "./interfaces/IAdBooster.sol";

contract AdBooster is IAdBooster, ReentrancyGuard, Ownable {
    uint256 public constant FEE = 50; // 0.5%
    uint256 public constant PERCENTAGE_DIVISOR = 10000;
    uint256 public constant SLOT_DURATION = 10 minutes;

    uint256 public immutable START_TIMESTAMP;
    address public immutable ID_REGISTRY;

    uint256 public earnedFees;
    mapping(bytes32 => mapping(uint256 => Ad)) private _ads;
    mapping(bytes32 => address) private _adSlotsCreators;

    constructor(address idRegistry) ReentrancyGuard() Ownable(msg.sender) {
        ID_REGISTRY = idRegistry;
        START_TIMESTAMP = block.timestamp;
    }

    /// @inheritdoc IAdBooster
    function buyAdSlot(bytes32 frameId, uint256 slot, string calldata ref) public payable nonReentrant {
        if (msg.value == 0) revert AmountCannotBeZero();
        uint256 fid = IIdRegistry(ID_REGISTRY).idOf(msg.sender);
        if (fid == 0) revert FidNotRegistered();
        if (getCurrentAdSlot() >= slot) revert InvalidSlot();
        if (_adSlotsCreators[frameId] == address(0)) revert AdSlotNotOnSale();

        Ad storage currentAd = _ads[frameId][slot];
        uint256 currentAdAmount = currentAd.amount;

        if (msg.value <= currentAdAmount) revert AmountMustBeGreaterThanTheCurrentOne();
        if (msg.value > currentAdAmount && currentAdAmount > 0) {
            (bool sent, ) = IIdRegistry(ID_REGISTRY).custodyOf(currentAd.fid).call{ value: currentAdAmount }("");
            if (!sent) revert FailedToSendEth();
        }

        _ads[frameId][slot] = Ad(fid, msg.value, ref);
        emit AdSlotBought(frameId, slot, fid, msg.value, ref);
    }

    /// @inheritdoc IAdBooster
    function claimRewardsByAdSlots(bytes32 frameId, uint256[] calldata slots) external payable nonReentrant {
        address creator = _adSlotsCreators[frameId];
        if (creator == address(0)) revert InvalidFrameId();

        uint256 currentSlot = getCurrentAdSlot();
        uint256 cumulativeAmount = 0;
        for (uint256 i = 0; i < slots.length; ) {
            uint256 slot = slots[i];
            if (slot >= currentSlot) revert InvalidSlot();

            Ad storage ad = _ads[frameId][slot];
            uint256 adAmount = ad.amount;
            if (adAmount == 0) revert AmountCannotBeZero();

            unchecked {
                cumulativeAmount += adAmount;
                ++i;
            }

            emit RewardClaimed(frameId, slot, IIdRegistry(ID_REGISTRY).idOf(creator), ad.fid, adAmount);
            delete _ads[frameId][slot];
        }

        uint256 fee = (cumulativeAmount * FEE) / PERCENTAGE_DIVISOR;
        uint256 rewardAmount = cumulativeAmount - fee;
        earnedFees += fee;

        (bool sent, ) = creator.call{ value: rewardAmount }("");
        if (!sent) revert FailedToSendEth();
    }

    /// @inheritdoc IAdBooster
    function getAdsBySlots(bytes32 frameId, uint256[] calldata slots) external view returns (Ad[] memory) {
        Ad[] memory ads = new Ad[](slots.length);
        for (uint256 i = 0; i < slots.length; i++) {
            ads[i] = _ads[frameId][slots[i]];
        }
        return ads;
    }

    /// @inheritdoc IAdBooster
    function getAdForCurrentSlot(bytes32 frameId) external view returns (Ad memory) {
        return _ads[frameId][getCurrentAdSlot()];
    }

    /// @inheritdoc IAdBooster
    function getCurrentAdSlot() public view returns (uint256) {
        return (block.timestamp - START_TIMESTAMP) / SLOT_DURATION;
    }

    /// @inheritdoc IAdBooster
    function isSaleEnabledFor(bytes32 frameId) external view returns (bool) {
        return _adSlotsCreators[frameId] != address(0);
    }

    /// @inheritdoc IAdBooster
    function putAdSlotsOnSale(bytes32 publicKey, bytes32 r, bytes32 s, bytes memory message) external {
        (MessageData memory messageData, ) = _verifyMessage(publicKey, r, s, message);
        if (messageData.type_ != MessageType.MESSAGE_TYPE_CAST_ADD) revert InvalidMessageType();

        string memory url = messageData.cast_add_body.embeds[0].url;
        bytes32 frameId = keccak256(abi.encode(url));

        address creator = IIdRegistry(ID_REGISTRY).custodyOf(messageData.fid);
        if (creator == address(0)) revert FidNotRegistered();
        if (_adSlotsCreators[frameId] != address(0)) revert FrameAlreadyOnSale();

        // TODO: there is no way to 100% know that a cast corresponds to a frame creation.
        // The only way is to suppose that an user submits the message corresponding to a frame creation.
        // Basically it does not make sense to call putAdSlotsOnSale with a message that doesn't correspond to a cast creation
        _adSlotsCreators[frameId] = creator;

        emit AdSlotsForSale(frameId, messageData.fid, url);
    }

    /// @inheritdoc IAdBooster
    function withdrawFees() external onlyOwner {
        (bool sent, ) = msg.sender.call{ value: earnedFees }("");
        if (!sent) revert FailedToSendEth();
        earnedFees = 0;
    }

    function _decodeMessageData(bytes memory message) internal pure returns (MessageData memory) {
        (bool success, , MessageData memory messageData) = MessageDataCodec.decode(0, message, uint64(message.length));
        if (!success) revert InvalidEncoding();
        return messageData;
    }

    function _verifyMessage(
        bytes32 publicKey,
        bytes32 r,
        bytes32 s,
        bytes memory message
    ) internal pure returns (MessageData memory, bytes32) {
        bytes memory messageHash = Blake3.hash(message, 20);
        bool valid = Ed25519.verify(publicKey, r, s, messageHash);
        if (!valid) revert InvalidSignature();
        return (_decodeMessageData(message), bytes32(messageHash));
    }
}
