// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

interface IVault {
    function mint(address to, uint256 amount) external;

    function burn() external;

    function addCeler(address account) external;

    function deleteCeler(address account) external;

    function setMinimumThreshold(uint256 value) external;
}