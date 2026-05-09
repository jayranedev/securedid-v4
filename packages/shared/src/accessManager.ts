import { Contract, ethers } from "ethers";
import { ACCESS_MANAGER_ABI } from "./abi/accessManager";
import { getReadProvider } from "./chain";

export function getAccessManagerRead(address: string): Contract {
  return new Contract(address, ACCESS_MANAGER_ABI, getReadProvider());
}

export async function getAccessManagerWrite(address: string, signer: ethers.Signer): Promise<Contract> {
  return new Contract(address, ACCESS_MANAGER_ABI, signer);
}
