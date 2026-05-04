# Vercel Deployment Checklist

## Pre-Deployment ✅
- [ ] All code pushed to GitHub (main/master branch)
- [ ] `.env.local` files updated with correct factory address: `0x0d22eF5A76d7a324c4177B2751570F54e4EC0B86`
- [ ] Local dev servers tested (http://localhost:3000-3005)
- [ ] No build errors: `npm run build`

## Vercel Account Setup ✅
- [ ] Vercel account created (https://vercel.com)
- [ ] GitHub account connected to Vercel
- [ ] Repository authorized

## Deploy Each App ✅

### 1. Factory App (3000)
- [ ] Create Vercel project at https://vercel.com/new
- [ ] Select repo: `BE-Proj-26`
- [ ] Root Directory: `apps/factory`
- [ ] Add environment variables (see list below)
- [ ] Deploy
- [ ] URL: `https://factory.vercel.app`

### 2. Panelist App (3001)
- [ ] Create Vercel project
- [ ] Root Directory: `apps/panelist`
- [ ] Add environment variables
- [ ] Deploy
- [ ] URL: `https://panelist.vercel.app`

### 3. Student App (3002)
- [ ] Create Vercel project
- [ ] Root Directory: `apps/student`
- [ ] Add environment variables
- [ ] Deploy
- [ ] URL: `https://student.vercel.app`

### 4. University App (3003)
- [ ] Create Vercel project
- [ ] Root Directory: `apps/university`
- [ ] Add environment variables (+ PLATFORM_ADDRESS)
- [ ] Deploy
- [ ] URL: `https://university.vercel.app`

### 5. College App (3004)
- [ ] Create Vercel project
- [ ] Root Directory: `apps/college`
- [ ] Add environment variables (+ PLATFORM_ADDRESS)
- [ ] Deploy
- [ ] URL: `https://college.vercel.app`

### 6. Explorer App (3005)
- [ ] Create Vercel project
- [ ] Root Directory: `apps/explorer`
- [ ] Add environment variables
- [ ] Deploy
- [ ] URL: `https://explorer.vercel.app`

## Environment Variables (ALL PROJECTS)
```
NEXT_PUBLIC_FACTORY_ADDRESS=0x0d22eF5A76d7a324c4177B2751570F54e4EC0B86
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
NEXT_PUBLIC_PINATA_JWT=<your-pinata-jwt-token>
```

## Environment Variables (COLLEGE ONLY)
```
NEXT_PUBLIC_PLATFORM_ADDRESS=0x0000000000000000000000000000000000000002
```

## Environment Variables (UNIVERSITY ONLY)
```
NEXT_PUBLIC_PLATFORM_ADDRESS=0x0000000000000000000000000000000000000003
```

## Post-Deployment Testing ✅
- [ ] Factory app loads: https://factory.vercel.app
- [ ] Connect MetaMask to Base Sepolia (chain ID 84532)
- [ ] Factory: Can view registries
- [ ] Panelist: Can log in and view dashboard
- [ ] Student: Can view institutions
- [ ] College: Can view platform
- [ ] University: Can view platform
- [ ] Explorer: Can search registries
- [ ] RPC calls working (check browser console for errors)
- [ ] No CORS errors in console
- [ ] Wallet connection works across all apps

## DNS / Custom Domains (Optional)
- [ ] Configure custom domain in each Vercel project settings
- [ ] Update DNS records at your domain registrar
- [ ] Wait for propagation (24-48 hours)

## CI/CD Setup (Optional)
- [ ] Configure automatic deployments on git push
- [ ] Set up branch deployments (preview on PR)
- [ ] Configure production environment (main branch)

## Support Links
- Vercel Dashboard: https://vercel.com/dashboard
- Vercel Docs: https://vercel.com/docs
- This Guide: See `VERCEL_DEPLOYMENT.md` in root

---
**Factory Contract (Base Sepolia)**: `0x0d22eF5A76d7a324c4177B2751570F54e4EC0B86`
**RPC Endpoint**: `https://base-sepolia.g.alchemy.com/v2/demo`
**Chain ID**: 84532
