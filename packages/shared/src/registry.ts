import { Contract, ethers } from "ethers";
import { REGISTRY_V6_ABI } from "./abi/registry";
import { FACTORY_ABI } from "./abi/factory";
import { getReadProvider } from "./chain";

const LOG_CHUNK = 9_000;
const BASE_SEPOLIA_BLOCK_TIME = 2; // seconds

export async function queryFilterAll(
  contract: Contract,
  filter: ethers.DeferredTopicFilter | ethers.EventLog,
  fromBlock?: number | { fromTimestamp: number },
): Promise<(ethers.EventLog | ethers.Log)[]> {
  const provider = contract.runner as ethers.Provider;
  const latest   = await provider.getBlockNumber();

  let start: number;
  if (typeof fromBlock === "object" && fromBlock !== null && "fromTimestamp" in fromBlock) {
    const secondsAgo = Math.max(0, Math.floor(Date.now() / 1000) - fromBlock.fromTimestamp);
    const blocksAgo  = Math.ceil(secondsAgo / BASE_SEPOLIA_BLOCK_TIME) + 500;
    start = Math.max(0, latest - blocksAgo);
  } else if (typeof fromBlock === "number") {
    start = fromBlock;
  } else {
    start = Math.max(0, latest - 100_000);
  }

  const results: (ethers.EventLog | ethers.Log)[] = [];
  for (let from = start; from <= latest; from += LOG_CHUNK) {
    const to = Math.min(from + LOG_CHUNK - 1, latest);
    const chunk = await contract.queryFilter(filter as ethers.DeferredTopicFilter, from, to);
    results.push(...chunk);
  }
  return results;
}

export function getRegistryRead(address: string): Contract {
  return new Contract(address, REGISTRY_V6_ABI, getReadProvider());
}

export async function getRegistryWrite(address: string, signer: ethers.Signer): Promise<Contract> {
  return new Contract(address, REGISTRY_V6_ABI, signer);
}

export function getFactoryRead(factoryAddress: string): Contract {
  if (!factoryAddress) throw new Error("Factory address not configured");
  return new Contract(factoryAddress, FACTORY_ABI, getReadProvider());
}

export async function getFactoryWrite(factoryAddress: string, signer: ethers.Signer): Promise<Contract> {
  if (!factoryAddress) throw new Error("Factory address not configured");
  return new Contract(factoryAddress, FACTORY_ABI, signer);
}

export enum ProposalType {
  ReplacePanelist  = 0,
  Enrollment       = 1,
  Revocation       = 2,
  ChangeThreshold  = 3,
  AddPanelist      = 4,
  RemovePanelist   = 5,
}

export interface ProposalSummary {
  id:         bigint;
  pType:      ProposalType;
  approvals:  number;
  executed:   bool;
  expiresAt:  number;
  proposer:   string;
  data:       string;
}

type bool = boolean;

export async function fetchProposal(registry: string, id: bigint): Promise<ProposalSummary> {
  const reg = getRegistryRead(registry);
  const [pType, approvals, executed, expiresAt, proposer, data] = await reg.getProposal(id);
  return {
    id,
    pType: Number(pType),
    approvals: Number(approvals),
    executed: executed as boolean,
    expiresAt: Number(expiresAt),
    proposer: (proposer as string).toLowerCase(),
    data: data as string,
  };
}

export async function fetchAllProposals(registry: string): Promise<ProposalSummary[]> {
  const reg = getRegistryRead(registry);
  const next: bigint = await reg.nextProposalId();
  const out: ProposalSummary[] = [];
  for (let i = 1n; i < next; i++) {
    out.push(await fetchProposal(registry, i));
  }
  return out;
}

export function decodeProposalData(pType: ProposalType, data: string): Record<string, unknown> {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  if (pType === ProposalType.Enrollment) {
    const [commitment] = coder.decode(["bytes32"], data);
    return { commitment };
  }
  if (pType === ProposalType.Revocation) {
    const [student, reason] = coder.decode(["address", "string"], data);
    return { student: (student as string).toLowerCase(), reason };
  }
  if (pType === ProposalType.ReplacePanelist) {
    const [slot, newAddr] = coder.decode(["uint8", "address"], data);
    return { slot: Number(slot), newPanelist: (newAddr as string).toLowerCase() };
  }
  if (pType === ProposalType.ChangeThreshold) {
    const [newThreshold] = coder.decode(["uint8"], data);
    return { newThreshold: Number(newThreshold) };
  }
  if (pType === ProposalType.AddPanelist) {
    const [newPanelist] = coder.decode(["address"], data);
    return { newPanelist: (newPanelist as string).toLowerCase() };
  }
  if (pType === ProposalType.RemovePanelist) {
    const [panelistAddr] = coder.decode(["address"], data);
    return { panelistAddr: (panelistAddr as string).toLowerCase() };
  }
  return {};
}

export function proposalTypeLabel(pType: ProposalType): string {
  return (
    ["Replace Panelist", "Enrollment", "Revocation", "Change Threshold", "Add Panelist", "Remove Panelist"][pType]
    ?? "Unknown"
  );
}
