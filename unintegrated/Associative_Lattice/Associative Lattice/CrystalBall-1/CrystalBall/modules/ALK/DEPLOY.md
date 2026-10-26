# ALK Deployment Guide

## Quick deploy to nginx server

```bash
# 1. On your server — create web root
sudo mkdir -p /var/www/alk
sudo chown $USER:$USER /var/www/alk

# 2. Generate self-signed TLS cert (camera + mic require HTTPS)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/alk.key \
  -out /etc/ssl/certs/alk.crt \
  -subj "/CN=$(hostname -I | awk '{print $1}')"

# 3. Upload ALK files
# From your local machine:
scp -r ALK/* user@YOUR_SERVER:/var/www/alk/

# 4. Install nginx config
sudo cp /var/www/alk/nginx.conf /etc/nginx/sites-available/alk
sudo ln -sf /etc/nginx/sites-available/alk /etc/nginx/sites-enabled/alk
sudo rm -f /etc/nginx/sites-enabled/default  # remove default if present
sudo nginx -t && sudo systemctl reload nginx

# 5. (Optional) LAN signaling server for cross-device mic
cd /var/www/alk
npm install ws
node lan-server.js &
# Or as a service:
# sudo systemctl enable alk-lan  # after creating systemd unit

# 6. Open in browser
# https://YOUR_SERVER_IP/video-demo.html
# https://YOUR_SERVER_IP/mic.html (on phone/second device)
```

## Self-signed cert browser warning

Chrome/Edge: click "Advanced" → "Proceed to site (unsafe)"
Firefox: click "Accept Risk and Continue"

For a real domain: use Let's Encrypt instead:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
# Edit nginx.conf: replace ssl_certificate paths with Let's Encrypt paths
```

## Mic bridge transport modes

| Mode | When to use | Setup needed |
|------|-------------|--------------|
| AUTO | Same device, different tab | None |
| SAME DEV | Explicitly same-device | None |
| LAN | Phone on same WiFi | Run lan-server.js |
| BLE | Any device within 10m | Chrome + BLE support |
| QR | Copy magnet link manually | None |

## Headless mode

The video-demo.html signal pipeline runs without a visible UI if you:
1. Open it in a hidden iframe or background tab
2. Receive bus events via BroadcastChannel from your own page

```js
// In your host page:
import { SISOBus } from './siso.js';
import { ALKMesh } from './modules/mesh/alk-mesh.js';

const bus = new SISOBus();
const mesh = new ALKMesh({ bus, headless: true });

bus.on('alk.latent.update', (ev) => {
  // receive signal from hidden ALK iframe
  console.log(ev.valence, ev.arousal, ev.suppression);
});

await mesh.startHost();
```

## Troubleshooting

**Camera/mic not working**: Must be served over HTTPS or localhost.
**MediaPipe slow to load**: First load downloads ~15MB WASM. Subsequent loads use cache.
**WebGL2 not available**: Chrome/Edge/Firefox all support it. Safari 15+.
**BLE not available**: Chrome only (not Firefox/Safari). Requires physical BLE hardware.
**Mic bridge not connecting**: Check browser console for `[ALK-Mesh]` errors.
