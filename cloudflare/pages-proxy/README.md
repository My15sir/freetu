# Pages production proxy

The existing Pages project keeps ownership of `imgaes.dpdns.org` because the parent DNS zone is not available in the Worker account.

This advanced-mode Pages Worker transparently forwards every request to the OpenNext Worker while preserving methods, bodies, cookies and authorization headers.

Deploy only after the OpenNext Worker has passed production readback:

```bash
npx wrangler pages deploy cloudflare/pages-proxy --project-name freetu --branch main
```

Rollback from the Pages dashboard by promoting the previous production deployment.
