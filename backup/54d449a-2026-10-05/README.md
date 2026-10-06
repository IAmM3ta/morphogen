# MORPHOS snapshot — 54d449a

Backup of the implementation in the app builder on 2026-10-05, before a republish of [morphos.grok.me](https://morphos.grok.me).

| | |
| --- | --- |
| Commit | `54d449aa39e6cb9319d93e3e74c233e09cab4811` |
| Subject | Merge glass-port-m12-full: MEMETiC glass, MORPHOS preserved |
| Archive | `morphos-54d449a.tar.gz` |
| SHA-256 | `bb4dde5222791a8d868efba271111fe4c611b8552f265ed9ce4e2a0b460913fa` |

The archive is `git archive` of that commit: source, public assets, docs, and lockfile. It does not include `node_modules`, `.env`, or the builder project id.

`FILES.txt` is the list of paths inside the archive.

## Restore

From a clean checkout of this repository:

```bash
tar -xzf backup/54d449a-2026-10-05/morphos-54d449a.tar.gz
# files land in ./morphos-54d449a/
```

Or return the branch to this commit:

```bash
git checkout 54d449aa39e6cb9319d93e3e74c233e09cab4811
```

The splash line in this snapshot is: “Tap to start sound. Drag to plant growth. Touch the field to hear it.” The source does not contain “Double-tap”.
