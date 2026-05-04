import { Contract, ethers } from "ethers";
import { FACTORY_ABI, REGISTRY_V6_ABI, getReadProvider } from "@securedid/shared";

export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "";

export function getFactoryRead(): Contract {
  if (!FACTORY_ADDRESS) throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS not set");
  return new Contract(FACTORY_ADDRESS, FACTORY_ABI, getReadProvider());
}

export async function getFactoryWrite(signer: ethers.Signer): Promise<Contract> {
  if (!FACTORY_ADDRESS) throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS not set");
  return new Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
}

export interface RegistryRow {
  address: string;
  name: string;
  website: string;
  deployedAt: number;
  deployer: string;
}

export async function listRegistries(): Promise<RegistryRow[]> {
  const factory = getFactoryRead();
  const addresses: string[] = await factory.getRegistries();
  const rows = await Promise.all(
    addresses.map(async (addr) => {
      const info = await factory.getInstitution(addr);
      return {
        address: addr.toLowerCase(),
        name: info.name as string,
        website: info.website as string,
        deployedAt: Number(info.deployedAt),
        deployer: (info.deployer as string).toLowerCase(),
      };
    })
  );
  return rows.sort((a, b) => b.deployedAt - a.deployedAt);
}

export async function getRegistryPanelists(registry: string): Promise<string[]> {
  const reg = new Contract(registry, REGISTRY_V6_ABI, getReadProvider());
  const ps: string[] = await reg.getPanelists();
  return ps.map((p) => p.toLowerCase());
}

export async function isNameTaken(name: string): Promise<boolean> {
  if (!name) return false;
  const factory = getFactoryRead();
  const hash = ethers.keccak256(ethers.toUtf8Bytes(name));
  return factory.usedNames(hash);
}
