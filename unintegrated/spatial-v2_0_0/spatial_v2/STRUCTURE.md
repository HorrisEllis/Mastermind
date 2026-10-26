spatial/                          # monorepo root
├── package.json                  # workspace root
├── packages/
│   ├── bus/                      # @spatial/bus
│   │   ├── package.json
│   │   └── src/
│   │       └── index.js          # siso.js → namespaced
│   ├── nexus/                    # @spatial/nexus
│   │   ├── package.json
│   │   └── src/                  # causal-nexus/src → namespaced
│   │       ├── index.js
│   │       ├── identity/
│   │       ├── causality/
│   │       ├── kernel/
│   │       ├── delta/
│   │       ├── compress/         # + codec bridge (new)
│   │       ├── forge/
│   │       ├── persist/
│   │       ├── query/
│   │       └── sigma/
│   ├── kernel/                   # @spatial/kernel
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js
│   │       ├── bus.js            # re-exports @spatial/bus
│   │       ├── species/
│   │       │   ├── human.js
│   │       │   ├── equine.js     # new
│   │       │   └── canine.js     # new
│   │       └── modules/          # ALK modules → adapted
│   │           ├── video/
│   │           ├── expression/
│   │           ├── signal/
│   │           ├── trajectory/
│   │           ├── behavior/
│   │           ├── codec-v2/
│   │           ├── codec/
│   │           └── htl/
│   ├── bridge/                   # @spatial/bridge
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js          # xlat-bridge.js → namespaced
│   │       └── species/
│   │           ├── equine-profile.js   # new
│   │           └── canine-profile.js   # new
│   ├── sigma/                    # @spatial/sigma
│   │   ├── package.json
│   │   └── src/
│   │       └── index.js          # nexus/sigma + SlopeEngine
│   ├── pat/                      # @spatial/pat
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js
│   │       ├── schema.js         # session schema v1
│   │       ├── store.js          # WAL + restore (nexus/persist)
│   │       └── query.js          # CQL surface
│   ├── resonance/                # @spatial/resonance
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js
│   │       ├── fingerprint.js    # attractor hash + profile
│   │       ├── distance.js       # weighted euclidean + grammar compat
│   │       └── engine.js         # match + nearby queries
│   ├── lattice/                  # @spatial/lattice
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js
│   │       ├── node.js
│   │       ├── edge.js
│   │       ├── graph.js
│   │       ├── search.js         # /find — semantic
│   │       └── cli.js            # /find /connect /inspect /cluster /graph
│   ├── field/                    # @spatial/field
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js
│   │       ├── synchrony.js
│   │       ├── mirroring.js
│   │       ├── attunement.js
│   │       └── tension.js
│   └── ase/                      # @spatial/ase
│       ├── package.json
│       └── src/
│           ├── index.js
│           ├── signature.js      # work fingerprint
│           ├── encounter.js      # encounter record
│           └── trajectory.js     # long-arc analytics
├── scripts/
│   ├── build-all.js
│   ├── test-all.js
│   └── publish-all.js
└── PACKAGES.md                   # this spec
