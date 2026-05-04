# Vercel Deployment Guide

## Overview
SecureDID has 6 frontend apps, each deployed as a separate Vercel project.

## Apps & Deployment URLs

| App | Directory | Domain | Port (local) |
|-----|-----------|--------|-------------|
| Factory | `apps/factory` | factory.vercel.app | 3000 |
| Panelist | `apps/panelist` | panelist.vercel.app | 3001 |
| Student | `apps/student` | student.vercel.app | 3002 |
| University | `apps/university` | university.vercel.app | 3003 |
| College | `apps/college` | college.vercel.app | 3004 |
| Explorer | `apps/explorer` | explorer.vercel.app | 3005 |

## Setup Instructions

### Prerequisites
- Vercel account (free tier okay)
- GitHub repo with code pushed
- Blockchain contract addresses:
  - Factory: `0x0d22eF5A76d7a324c4177B2751570F54e4EC0B86` (Base Sepolia)

### 1. Create Each Vercel Project

For **each app**, go to [vercel.com/new](https://vercel.com/new):

1. **Sign in** with GitHub
2. **Select repository**: `BE-Proj-26` (or your repo name)
3. **Framework**: Next.js (auto-detected)
4. **Root Directory**: Set to the app path, e.g., `apps/factory`
5. **Build & Output Settings**:
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`
6. **Environment Variables** (add for ALL projects):
   ```
   NEXT_PUBLIC_FACTORY_ADDRESS=0x0d22eF5A76d7a324c4177B2751570F54e4EC0B86
   NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
   NEXT_PUBLIC_PINATA_JWT=<your-pinata-jwt>
   BASE_RPC_URL=https://sepolia.base.org
   ```
7. **College & University only** (add):
   ```
   NEXT_PUBLIC_PLATFORM_ADDRESS=0x0000000000000000000000000000000000000002  (college)
   NEXT_PUBLIC_PLATFORM_ADDRESS=0x0000000000000000000000000000000000000003  (university)
   ```
8. **Project Name**: Use a descriptive name, e.g., `securedid-factory`, `securedid-panelist`, etc.
9. **Deploy**

### 2. Update DNS / Link Apps (Optional)

If you have custom domains, configure in Vercel dashboard:
- Vercel → Project → Settings → Domains
- Add your custom domain and follow DNS setup

### 3. Environment Variables Across All Projects

Vercel dashboard → each project → Settings → Environment Variables:

| Variable | Value | Projects |
|----------|-------|----------|
| `NEXT_PUBLIC_FACTORY_ADDRESS` | `0x0d22eF5A76d7a324c4177B2751570F54e4EC0B86` | All |
| `NEXT_PUBLIC_IPFS_GATEWAY` | `https://gateway.pinata.cloud/ipfs` | All |
| `NEXT_PUBLIC_PINATA_JWT` | Your Pinata JWT | All |
| `BASE_RPC_URL` | `https://sepolia.base.org` | All |
| `NEXT_PUBLIC_PLATFORM_ADDRESS` | `0x0000...0002` | College only |
| `NEXT_PUBLIC_PLATFORM_ADDRESS` | `0x0000...0003` | University only |

### 4. Verify Deployments

After each deploy:
1. Visit the project URL (e.g., `https://factory.vercel.app`)
2. Check browser console for errors
3. Test wallet connection
4. Verify RPC calls work (Alchemy Base Sepolia endpoint is configured in `packages/shared/src/chain.ts`)

## Troubleshooting

### Build Fails
- Check Vercel build logs (Deployments → click failed build → Logs)
- Ensure Root Directory is set correctly
- Verify all env vars are present

### RPC Connection Errors
- RPC endpoint is set to Base Sepolia public RPC in `chain.ts`
- If it fails, check network in MetaMask (should be Base Sepolia, chain ID 84532)

### CORS Errors
- The server-side proxy uses the Base Sepolia public RPC by default
- If you set a custom RPC, ensure it is reachable from Vercel and not rate-limited

## Redeployment

To redeploy after code changes:
1. Push to GitHub (`git push origin main`)
2. Vercel auto-triggers new builds
3. Or manually trigger in Vercel dashboard → Deployments → Redeploy

## Monorepo Optimization

All apps share:
- `packages/shared` (crypto, wallet, components, ABIs)
- Root `package.json` with workspace definitions
- Root `tsconfig.json`

Vercel's monorepo detection automatically installs all dependencies.

## Support

- Vercel Docs: https://vercel.com/docs/concepts/monorepos
- Base Sepolia Info: https://base.org
- Pinata IPFS: https://pinata.cloud
