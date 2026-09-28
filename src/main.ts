import './styles/base.css';
import './styles/layout.css';
import './styles/preview.css';
import { initApp } from './components/App';
import { mountInviteEntry, mountLandingEntry } from './components/route-shells';
import { parseClientRoute } from './lib/client-router';

const route = parseClientRoute(window.location.pathname);

switch (route.handler) {
  case 'landing':
    mountLandingEntry();
    break;
  case 'app':
    initApp().catch(console.error);
    break;
  case 'share':
    // Editor shell; App loads the shared document from /shared/:id.
    initApp().catch(console.error);
    break;
  case 'invite':
    mountInviteEntry(route.id);
    break;
}
