# Campaigns

A Vite + React + TypeScript project styled with Tailwind CSS.

## Deployment

This project deploys automatically to **Cloudflare Pages** via GitHub Actions on every push to the `main` branch.

### Setup

To enable deployments, add the following secrets to your GitHub repository (**Settings → Secrets and variables → Actions**):

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with Pages edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

The Cloudflare Pages project name is **`campaigns`**.

### Manual deployment

You can also trigger a deployment manually from the **Actions** tab using the `workflow_dispatch` event.

## Local development

```bash
npm install
npm run dev
```
