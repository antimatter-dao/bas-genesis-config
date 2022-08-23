// SPDX-License-Identifier: MT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./InjectorContextHolder.sol";

contract Vault is InjectorContextHolder, OwnableUpgradeable, PausableUpgradeable {
    uint256 public totalSupply;
    uint256 public minimumThreshold;
    mapping (address => bool) bridges;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event BridgeAdded(address indexed sender, address indexed account);
    event BridgeDeleted(address indexed sender, address indexed account);
    event MinimumThresholdSet(address indexed sender, uint256 indexed old, uint256 indexed value);

    constructor(
        IStaking stakingContract,
        ISlashingIndicator slashingIndicatorContract,
        ISystemReward systemRewardContract,
        IStakingPool stakingPoolContract,
        IGovernance governanceContract,
        IChainConfig chainConfigContract,
        IRuntimeUpgrade runtimeUpgradeContract,
        IDeployerProxy deployerProxyContract,
        IVault vaultContract
    ) InjectorContextHolder(
        stakingContract,
        slashingIndicatorContract,
        systemRewardContract,
        stakingPoolContract,
        governanceContract,
        chainConfigContract,
        runtimeUpgradeContract,
        deployerProxyContract,
        vaultContract
    ) {
    }

    function initialize() external initializer {
        __Ownable_init();
        __Pausable_init();
    }

    function mint(address to, uint256 amount) public whenNotPaused onlyBridge {
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn() public payable whenNotPaused {
        require(msg.value >= minimumThreshold, "Forbid");
        totalSupply -= msg.value;
        emit Transfer(msg.sender, address(0), msg.value);
    }

    function addBridge(address account) public onlyFromGovernance {
        require(!bridges[account], "Forbid");
        bridges[account] = true;
        emit BridgeAdded(msg.sender, account);
    }

    function deleteBridge(address account) external onlyFromGovernance {
        require(bridges[account], "Forbid");
        bridges[account] = false;
        emit BridgeDeleted(msg.sender, account);
    }

    function setMinimumThreshold(uint256 value) external onlyFromGovernance {
        uint256 old = minimumThreshold;
        minimumThreshold = value;
        emit MinimumThresholdSet(msg.sender, old, value);
    }

    modifier onlyBridge() {
        require(bridges[msg.sender], "Only bridge can call function");
        _;
    }
}