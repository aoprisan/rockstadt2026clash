import './style.css';
import { mount } from './render';
import { init as initNotifications } from './notify';
import { importPicksFromUrl } from './picks-link';
import { importBeamFromUrl } from './crew-qr';
import { registerSW } from 'virtual:pwa-register';
import { buildLabel, BUILD_COMMIT } from './build-info';
import { noteRegistration, openVersion, stripFreshMarker } from './version';
import { maybeShowWelcome, openWelcome } from './welcome';

// A force update reloads with a cache-busting `?fresh=…`; clear it before
// anything reads the URL, so it never ends up in a shared link.
stripFreshMarker();

// Import picks shared via a `#p=…` link before the first render so the app
// opens straight onto the shared line-up. Crew beams (`#c=…`) arriving as
// links merge into the crew the same way — without touching your own picks.
importPicksFromUrl();
importBeamFromUrl();

const app = document.getElementById('app');
if (app) {
  mount(app);

  // Schedule set-start reminders for the user's picks (device-local).
  initNotifications();

  app.appendChild(buildFooter());

  // First visit on this device: a one-minute tour of where everything lives.
  maybeShowWelcome();
}

/**
 * Footer: the standing disclaimer, plus the two things that are useless buried
 * anywhere else — the way back into the guide, and the build stamp of the copy
 * you are actually running (tap it for the update controls).
 */
function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'app-footer';

  const note = document.createElement('p');
  note.className = 'app-footer-note';
  note.innerHTML =
    'Unofficial clashfinder · Set times from the official day posters and subject to change.<br>Your picks are saved on this device only.';
  footer.appendChild(note);

  const actions = document.createElement('div');
  actions.className = 'app-footer-actions';

  const guide = document.createElement('button');
  guide.type = 'button';
  guide.className = 'app-footer-btn';
  guide.textContent = '❔ How this works';
  guide.addEventListener('click', () => openWelcome());
  actions.appendChild(guide);

  const version = document.createElement('button');
  version.type = 'button';
  version.className = 'app-footer-btn app-footer-build';
  version.textContent = `⟳ Build ${buildLabel()} · ${BUILD_COMMIT}`;
  version.title = 'Check for a newer version, or force one through';
  version.addEventListener('click', () => openVersion());
  actions.appendChild(version);

  footer.appendChild(actions);
  return footer;
}

// ---- PWA install prompt ----
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installBtn = document.getElementById('install-btn') as HTMLButtonElement | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  installBtn?.classList.add('show');
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.remove('show');
});

window.addEventListener('appinstalled', () => {
  installBtn?.classList.remove('show');
});

// ---- service worker ----
// `autoUpdate` swaps a new build in on its own; handing the registration to the
// version panel lets it report the offline copy's state and check on demand.
registerSW({
  immediate: true,
  onRegisteredSW: (_url, reg) => noteRegistration(reg),
});
