# Conflict txid probes (read-only, 2026-10-04)

Gateway ignores Range requests (always full 200, no Content-Length header, chunked), so size = bytes received. No ID3v2 at file start and no ID3v1 ("TAG") at end on either file: ID3 cannot identify these mixes. Identification must use duration/size.

| txid | bytes | content-type | MPEG | bitrate | Xing/Info frames | duration |
|---|---|---|---|---|---|---|
| pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg | 166,272,103 | audio/mpeg | MPEG1 L3 44.1k | 128 kbps CBR | 397,818 | 2:53:11 |
| 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA | 137,018,513 | audio/mpeg | MPEG1 L3 44.1k | 320 kbps CBR | 131,130 | 0:57:05 |
| neH-PrcWXd71JCZayTX (HPIT, 19 chars) | n/a | HTTP 404 text/html | | | | unresolvable (truncated; needs wallet/GraphQL prefix search) |

Reading:
- pk_RL...: 2:53:11 matches Blue Jay's recorded mixDuration "2:58" far better than Bernard Badie's "0:00" (unknown). Likely Blue Jay's Studio409 file; Bernard Badie/UE B2B Sean Smith probably has no file of its own (owner ear-check advised; not proven).
- 5lOn...: a 57-minute 320k file. Used by "For Hakim" (x2) and "Little White Earbuds Mix". Cannot tell which title it is from tags; "Little White Earbuds Mix" is the one the plan suspects is wrong.
- Note: the working-tree artists.json already has distinct Akila txids (the Akila duplicate in the plan no longer reproduces).
Raw: probe/*.hdr, probe/*.head64k (first 64KB of each).
