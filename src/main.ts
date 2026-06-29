import './style.css';
import { mount } from './render';
import { init as initNotifications } from './notify';
import { registerSW } from 'virtual:pwa-register';

const app = document.getElementById('app');
if (app) {
  mount(app);

  // Schedule set-start reminders for the user's picks (device-local).
  initNotifications();

  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML =
    'Unofficial clashfinder · Set times from the official day posters and subject to change.<br>Your picks are saved on this device only.';
  app.appendChild(footer);
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
registerSW({ immediate: true });
