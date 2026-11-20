# Issue log: Lumen agent integration lab

One row per real problem you hit. Fill it **while** debugging; memory is unreliable a week later.
Every row is a potential STAR answer for "tell me about an integration issue you fixed".

| # | Date | Phase / component | Symptom (exact error, where seen) | Root cause | How I diagnosed it (tools, logs) | Fix | Prevention / what I'd put in the playbook | Time lost |
|---|------|-------------------|-----------------------------------|------------|----------------------------------|-----|-------------------------------------------|-----------|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

## Measurements

| Call | Hop | p50 ms | p95 ms | Payload KB | Notes |
|------|-----|--------|--------|------------|-------|
| order status | S/4 sandbox direct | | | | |
| order status | via CPI | | | | |
| order status | via APIM (no cache) | | | | |
| order status | via APIM (cache hit) | | | | |
| order status | APIM v1 basic vs v2 OAuth cached | | | | |
