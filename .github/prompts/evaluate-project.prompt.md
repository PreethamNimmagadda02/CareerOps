---
description: "Evaluate a portfolio project idea against target roles. Score signal strength, uniqueness, demo-ability, metrics potential, time to MVP, and STAR story potential."
agent: "agent"
tools: [read, web]
---

# Evaluate Portfolio Project

Read the full project evaluation instructions from `modes/project.md` and execute them.

## 6-Dimension Scoring:

| Dimension | Weight |
|-----------|--------|
| Signal for target roles | 25% |
| Uniqueness | 20% |
| Demo-ability | 20% |
| Metric potential | 15% |
| Time to MVP | 10% |
| STAR story potential | 10% |

## Verdicts:

- **BUILD** — Worth building, here are milestones
- **SKIP** — Not worth it, here's why + better alternative
- **PIVOT** — Good idea but better as this variant

Run `npm run dynamo:cv` and `npm run dynamo:profile` for candidate context and target roles from DynamoDB.
