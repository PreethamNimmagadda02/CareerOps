---
description: "Generate LinkedIn outreach messages for a specific job application. Identifies hiring managers, recruiters, and peers, then drafts 300-char connection messages."
agent: "agent"
tools: [read, web]
---

# LinkedIn Outreach Message Generator

Read the full outreach instructions from `modes/contacto.md` and execute them.

## Quick Reference:

1. Run `npm run dynamo:cv` and `npm run dynamo:profile` for candidate context from DynamoDB
2. Identify targets: hiring manager, recruiter, 2-3 peers at the company
3. For each target, generate a 3-phrase message:
   - **Hook**: Something specific about their work or the company
   - **Proof**: One concrete thing you've built/done (from CV)
   - **Proposal**: Clear ask (coffee chat, referral, learn more)
4. Max 300 characters (LinkedIn connection request limit)
5. Generate EN and ES versions if applicable
6. Include alternative targets with justification

## Tone

- Direct, no corporate-speak
- Specific references to their work or company
- Never generic "I'd love to connect"
