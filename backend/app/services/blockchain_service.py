"""
DID Document hash anchoring on Base Sepolia testnet.

The contract stores a mapping: did_string => sha256_hash.
ABI is minimal — one write function and one read function.

Minimal Solidity contract (deploy once):

    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.20;

    contract DIDRegistry {
        mapping(string => string) private _hashes;

        event DIDAnchored(string indexed did, string hash);

        function anchorDID(string calldata did, string calldata hash) external {
            _hashes[did] = hash;
            emit DIDAnchored(did, hash);
        }

        function getHash(string calldata did) external view returns (string memory) {
            return _hashes[did];
        }
    }
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy import — only fails at call-time if web3 is missing or env vars unset
_w3 = None
_contract = None

CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "did", "type": "string"},
            {"internalType": "string", "name": "hash", "type": "string"},
        ],
        "name": "anchorDID",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "string", "name": "did", "type": "string"}],
        "name": "getHash",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
]


def _get_web3():
    global _w3
    if _w3 is None:
        from web3 import Web3
        rpc_url = os.environ.get("BASE_RPC_URL", "https://sepolia.base.org")
        _w3 = Web3(Web3.HTTPProvider(rpc_url))
    return _w3


def _get_contract():
    global _contract
    if _contract is None:
        w3 = _get_web3()
        contract_address = os.environ.get("DID_REGISTRY_CONTRACT_ADDRESS", "")
        if not contract_address or contract_address == "0x" + "0" * 40:
            return None  # contract not deployed yet
        _contract = w3.eth.contract(
            address=w3.to_checksum_address(contract_address),
            abi=CONTRACT_ABI,
        )
    return _contract


async def anchor_did_hash(did: str, sha256_hash: str) -> Optional[str]:
    """
    Write (did, hash) to the DIDRegistry contract on Base Sepolia.
    Returns the transaction hash on success, or None if contract not configured.
    Falls back gracefully — DID issuance still proceeds even if anchoring fails.
    """
    try:
        w3 = _get_web3()
        contract = _get_contract()
        if contract is None:
            logger.warning("DIDRegistry contract not configured — skipping on-chain anchoring")
            return None

        private_key = os.environ.get("ANCHOR_WALLET_PRIVATE_KEY", "")
        if not private_key or private_key == "0x" + "0" * 64:
            logger.warning("Anchor wallet private key not set — skipping on-chain anchoring")
            return None

        account = w3.eth.account.from_key(private_key)
        nonce = w3.eth.get_transaction_count(account.address)
        gas_price = w3.eth.gas_price

        tx = contract.functions.anchorDID(did, sha256_hash).build_transaction(
            {
                "from": account.address,
                "nonce": nonce,
                "gas": 100_000,
                "gasPrice": gas_price,
                "chainId": 84532,  # Base Sepolia chain ID
            }
        )
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        tx_hex = tx_hash.hex()
        logger.info("DID anchored on Base Sepolia: did=%s tx=%s", did, tx_hex)
        return tx_hex

    except Exception as exc:
        logger.error("Blockchain anchoring failed (non-fatal): %s", exc)
        return None


async def verify_did_hash(did: str, expected_hash: str) -> bool:
    """
    Read the stored hash for a DID from Base Sepolia and compare.
    Returns False if contract not configured or call fails.
    """
    try:
        contract = _get_contract()
        if contract is None:
            return False
        stored = contract.functions.getHash(did).call()
        return stored == expected_hash
    except Exception as exc:
        logger.error("Blockchain verification failed: %s", exc)
        return False
