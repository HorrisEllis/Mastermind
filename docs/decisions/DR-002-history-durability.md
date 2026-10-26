# DR-002 — History durability with no remote

- **Date** 2026-08-11 · **Version** 0.1.2 · **Status** Accepted
- **Owner** James Brooks · **Related** §0.3, §17.4, §17.8, §1.1

## Problem

`.git/config` has no `[remote]`. 34 commits of history exist in exactly one
place: the `.git` directory inside whichever folder currently holds the
project. Losing that folder loses the entire causal record of the build —
a direct §0.3 failure with no recovery path.

## Decided

Three layers, in increasing order of independence:

1. **`.git` ships inside every delivered zip.** Verified by extraction, not
   assumed: the delivered archive was unzipped, `git fsck` run clean, 34
   commits and tag `v0.1.1` confirmed present.
2. **`npm run archive`** writes a single-file `git bundle` containing every
   commit, branch and tag, then *proves* it by verifying completeness and
   cloning it into a temp directory and comparing commit counts. A bundle
   that verifies but will not clone fails the run loudly (§1.1 — nothing
   exists until demonstrated).
3. **The bundle is delivered as its own artifact**, outside the zip, so it
   can be stored somewhere the project folder is not.

## Rejected

**Committing the bundle into the repository it archives.** Circular: the
archive dies with the thing it protects. `dist/` stays gitignored.

**Relying on the zip alone.** The zip is one file in one place. Same failure
mode as the folder, one step removed.

**Setting up a remote automatically.** Requires credentials that are not
mine to hold, and pushing a repository containing an author email and full
history to a host is the human's decision, not an assistant's. The command
is documented instead:

```
git remote add origin <url>
git push -u origin main --tags
```

## Accepted limitation

A bundle captures **commits only**. Uncommitted working-tree changes are not
in it. The script prints the dirty file list loudly rather than letting
anyone believe otherwise.
