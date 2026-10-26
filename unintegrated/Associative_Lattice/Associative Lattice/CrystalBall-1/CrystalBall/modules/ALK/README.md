# ALK — Associative Lattice Kernel
**v1.8.0**

Behavioral signal runtime. Face → body → voice → expression → latent state → particle field.

## Structure

```
ALK/
├── video-demo.html      ← Demo (serve over HTTP, not file://)
├── siso.js              ← SISO event bus (Jonathan Bailey)
├── jaa-browser.js       ← Jaa persistence + debug logging
├── kernel.js            ← ALK kernel
├── MANIFEST.json
├── README.md
└── modules/
    ├── cfr/             ← ALK-GL WebGL2 particle field
    ├── expression/      ← Expression engine (micro → macro)
    ├── signal/          ← Latent model + suppression score
    ├── trajectory/      ← Attractor landscape + field portrait
    ├── video/           ← Video module + codec
    └── text/            ← Text module + PCM processor
```

## Running

```bash
npx serve .
# Open: http://localhost:3000/video-demo.html
```

## Debug Panel

Click the ⬡ button (bottom-right) to open the Jaa debug panel.
Tabs: LOG (event stream) · WORLD (attractor positions + GPU readback) · STATS · LATENT (Bayesian state vector)
