# NeetCode 150 Tracker — Plan

## What this is

A self-hosted web app to track progress through the [NeetCode 150](https://neetcode.io/roadmap) problem list
with a real deadline, spaced repetition for shaky problems, and a daily goal algorithm designed to actually
get you hired.

**Not just a checkbox tracker.** NeetCode.io's built-in tracker is checkboxes. This adds:
- Deadline-aware pace tracking (required problems/day to hit your target date)
- Spaced repetition for problems you mark as shaky (1d → 3d → 7d review intervals, auto-clears after 3 reviews)
- "Today's N problems" queue: due reviews first, then next unsolved in roadmap order
- Streak tracking against your daily goal
- Per-problem notes for patterns / techniques
- Sunday review tab showing all currently shaky problems

## Current state (v0.1 — personal NAS build)

| Layer | Tech |
|---|---|
| Backend | Python FastAPI, JSON file persistence |
| Frontend | React + Vite + Mantine v7 + TypeScript |
| Container | Docker, single image (frontend built into static files served by FastAPI) |
| Data | `/volume1/docker/appdata/neetcode-tracker/data.json` |
| Hosting | Personal NAS on port 6969 |

All 150 problems are seeded with correct names, topics, and difficulties in NeetCode roadmap order.

## Planned — turn this into a real product

### 1. Onboarding flow (highest priority)

Right now the app assumes a hardcoded target date and daily goal. A new user needs to set up:

- [ ] Target date (when do you want to finish?)
- [ ] Current solved count (how many have you already done?)
- [ ] Which problems are already done (bulk-check UI or import)
- [ ] Daily goal auto-calculated from the above, but editable
- [ ] Optional: what kind of role / company tier are you targeting (affects which topics to prioritize)

This flow should appear on first load if no data exists.

### 2. Auth + multi-user

- [ ] Email/password or OAuth (GitHub is the obvious choice for a dev audience)
- [ ] Each user gets isolated data
- [ ] Postgres instead of JSON file

### 3. Hosting

**Recommendation: Cloudflare Tunnel (free)**

Cloudflare Tunnel runs a lightweight `cloudflared` daemon on the NAS that opens an outbound connection to
Cloudflare's edge — no port forwarding, no open router ports, no static IP needed. You get a public HTTPS
URL on your own domain (or a free `*.trycloudflare.com` subdomain). Handles DDoS, SSL, caching for free.

- Works with the existing Docker setup, zero infra changes
- Completely free for personal/small scale
- Custom domain: just point a CNAME at Cloudflare

**Why not Tailscale Funnel?**
Tailscale Funnel also exposes services publicly for free, but it's limited to 3 funnels on the free plan and
the URL is tied to your Tailscale identity. Fine for personal use, not ideal for sharing with others.

**For a proper product (paid/auth/DB):** migrate to Railway or Fly.io — both have free tiers, both support
Docker deploys, both include managed Postgres.

### 4. LeetCode sync

- [ ] LeetCode has an unofficial GraphQL API — can query solved problems by username
- [ ] Let users paste their LeetCode username and auto-mark solved problems on first load
- [ ] Periodically re-sync so they don't have to manually check problems off

### 5. Nice-to-haves

- [ ] Mobile-friendly layout improvements
- [ ] Dark/light mode toggle (currently dark-only)
- [ ] Export progress as CSV / share card ("I solved 120/150 NeetCode problems!")
- [ ] Email reminders (weekly pace check-in)
- [ ] Company-specific problem tags (which problems come up at Google / Meta / etc.)
