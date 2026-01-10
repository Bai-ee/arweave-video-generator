# AI Index - Routing Reference

**Purpose**: Route AI agents to subject-specific docs ONLY when needed.

**Do NOT read all docs/** - Only read docs when your task matches a subject below.

---

## Quick Lookup

| Your Task | Read This Doc |
|-----------|---------------|
| Modify API endpoint | docs/API_REFERENCE.md |
| Deploy to production | docs/DEPLOYMENT.md |
| Fix video generation | docs/FEATURES.md |
| Debug issues | docs/TROUBLESHOOTING.md |
| Add/modify video filters | docs/FEATURES.md |
| Change ArNS behavior | docs/ARNS_TROUBLESHOOTING.md |
| Set up local dev | docs/LOCAL_DEVELOPMENT.md |
| Update storage rules | docs/FIREBASE_STORAGE_RULES.md |
| Code patterns | docs/BEST_PRACTICES.md |

---

## Full Reference

### Video & Processing
| Task | Doc |
|------|-----|
| Video generation flow | docs/FEATURES.md |
| Video filters | docs/FEATURES.md |
| Folder selection | docs/FEATURES.md |

### API & Backend
| Task | Doc |
|------|-----|
| API endpoints | docs/API_REFERENCE.md |
| API behavior changes | docs/API_REFERENCE.md |

### Deployment & Ops
| Task | Doc |
|------|-----|
| Deploy process | docs/DEPLOYMENT.md |
| Vercel setup | docs/DEPLOYMENT.md |
| GitHub Actions | docs/DEPLOYMENT.md |
| Vercel logs | docs/HOW_TO_VIEW_VERCEL_LOGS.md |

### Storage & Database
| Task | Doc |
|------|-----|
| Firebase Storage rules | docs/FIREBASE_STORAGE_RULES.md |
| Storage issues | docs/TROUBLESHOOTING.md |

### Arweave & ArNS
| Task | Doc |
|------|-----|
| ArNS issues | docs/ARNS_TROUBLESHOOTING.md |
| Arweave setup | docs/ARWEAVE_ENV_SETUP.md |

### General
| Task | Doc |
|------|-----|
| Code patterns | docs/BEST_PRACTICES.md |
| Troubleshooting | docs/TROUBLESHOOTING.md |
| Local setup | docs/LOCAL_DEVELOPMENT.md |

---

## Safe to Edit

| Area | Files |
|------|-------|
| Video pipeline | `worker/lib/*.js` |
| Frontend UI | `public/index.html` |
| Documentation | `docs/*.md` |
| Utilities | `lib/*.js` |

## Requires Caution

| Area | Files |
|------|-------|
| API endpoints | `api/*.js` (12 function limit) |
| Storage rules | `storage.rules` |
| Route config | `vercel.json` |
| Workflow entry | `worker/processor.js` |

---

## Workflow Summary

1. Check table above for your task
2. Read ONLY the matching doc (if listed)
3. Make code changes
4. If your change affects docs, update them
5. If docs don't match code, warn explicitly

---


