# ALK — Associative Lattice Kernel
**v1.9.1**

Behavioral signal runtime. Face → body → voice → expression → latent state → particle field.

## Structure

```
ALK/
├── kernel.js               ← ALK kernel (ALKModule base class)
├── siso.js                 ← SISO event bus
├── jaa-browser.js          ← Jaa persistence + debug logging
├── MANIFEST.json
├── README.md
├── DEPLOY.md
├── demo/
│   ├── video-demo.html     ← Main demo shell (serve over HTTP, not file://)
│   ├── style.css           ← extracted from video-demo.html
│   └── app.js               ← extracted from video-demo.html (type="module")
├── mic.html                 ← External mic client
├── mic.css                  ← extracted from mic.html
├── mic.js                    ← extracted from mic.html (type="module")
└── modules/
    ├── cfr/                ← ALK-GL WebGL2 particle field (alk-gl.js, cfr-mesh-bridge.js)
    ├── expression/          ← Expression engine (micro → macro)
    ├── signal/              ← Signal topology, latent model, suppression score
    ├── trajectory/          ← Attractor landscape, trajectory recorder, field portrait
    ├── video/               ← Video module + codec (client, server, v2)
    ├── text/                ← Text module + PCM processor
    ├── behavior/            ← Behavior module
    └── mesh/                ← ALKMesh, MagnetLink
```

## Running

```bash
npx serve .
# Demo: http://localhost:3000/demo/video-demo.html
# Mic:  http://localhost:3000/mic.html
```

## Debug Panel

Click the ⬡ button (bottom-right) to open the Jaa debug panel.
Tabs: LOG (event stream) · WORLD (attractor positions + GPU readback) · STATS · LATENT (Bayesian state vector)

## Notes on this build

Assembled from `ALK_v1_9.1_patched.zip` (the most complete revision found among the uploaded
archives — a strict superset of the plain v1.9.0 build, including `modules/mesh/alk-mesh.js`,
`DEPLOY.md`, and `mic.html`, none of which were duplicated with conflicting content anywhere else
in the upload). The separately-versioned `ALK_v2_0_0.zip` was **not** used as the base: its
manifest bumps to 2.0.0 and references `modules/mesh/`, `modules/htl/`, `lan-server.js`, and
`nginx.conf`, but the zip itself ships only `kernel.js`, `video-demo.html`, `siso.js`,
`jaa-browser.js`, `MANIFEST.json`, `mic.html`, and `DEPLOY.md` — no `modules/` directory at all.
It's a manifest/scaffold bump without the module implementations, not a further-along build.

`lan-server.js` and `nginx.conf` are referenced in `MANIFEST.json`'s `infrastructure` block but
were not present in any archive uploaded — the manifest was left as-is rather than silently
dropping the reference.

`video-demo.html` was moved into `demo/` because its script's imports (`../siso.js`,
`../jaa-browser.js`, `../modules/...`) are written assuming the file sits one directory below ALK's
root — that was true in every revision checked, so the file was relocated to match its own imports
rather than rewriting eleven import paths. `mic.html`'s imports are root-relative (`./siso.js`,
`./modules/...`), so it stays at the ALK root.

Four broken relative-import paths were fixed (pre-existing in the source, unrelated to this
component split — confirmed by checking the path depth against actual file locations):
- `modules/text/text-module.js`: `../kernel.js` → `../../kernel.js`
- `modules/video/video-module.js`: `./kernel.js` → `../../kernel.js`
- `modules/behavior/behavior-module.js`: `../kernel.js` → `../../kernel.js`
- `modules/video/video-module.server.js`: `../codec.js` → `./codec.js`
- `demo/app.js` (from `video-demo.html`): `alk-mesh.js` import used `./` while the other eleven
  imports in the same block used `../` — normalized to `../modules/mesh/alk-mesh.js`.

All JS in this tree passes `node --check`. All relative imports were resolved against the actual
file tree and confirmed to exist.
