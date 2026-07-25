import { FESTIVAL } from './data';
import { buildLabel } from './build-info';

/**
 * The welcome screen: a one-minute read of what the app does and where each
 * feature lives, shown once on a device's first visit and re-openable from the
 * footer ever after.
 *
 * The app has grown a lot of rooms — a planner, an autopilot, a stamina model, a
 * crew beam, a gate list — and almost all of them sit one tap behind a collapsed
 * panel. Nothing here is new behaviour; it is a map of the buttons, so the depth
 * is discoverable instead of merely present.
 */

const SEEN_KEY = 'ref2026.welcome.v1';

interface GuideItem {
  icon: string;
  title: string;
  body: string;
}

interface GuideSection {
  title: string;
  items: GuideItem[];
}

const SECTIONS: GuideSection[] = [
  {
    title: 'The basics',
    items: [
      {
        icon: '👆',
        title: 'Tap a band to pick it',
        body: 'The timeline shows all three stages side by side, one tab per festival day. Tap any set to add it to your line-up; tap the ★ on a picked set to mark it a must-see. Everything saves on this device — no account, no sign-up.',
      },
      {
        icon: '⚠️',
        title: 'Clashes find themselves',
        body: 'Two picks that overlap turn red; two on different stages with too little time to walk between them turn amber. The header counts both while you plan.',
      },
      {
        icon: '🎛',
        title: 'Filters, picks & clashes',
        body: 'The bar under the day tabs opens the day’s clash list — including a duel card that helps you settle each one — plus the “only my picks” filter, band search and the Now / Next bar.',
      },
    ],
  },
  {
    title: 'While you’re there',
    items: [
      {
        icon: '⚡',
        title: 'Pilot',
        body: 'Live turn-by-turn guidance: what you are watching, what is next, when to leave and which way to walk.',
      },
      {
        icon: '🧭',
        title: 'Plan',
        body: 'Turns your picks — clashes and all — into a workable running order for one day, protecting your starred sets.',
      },
      {
        icon: '🗺',
        title: 'Map & 🌤 Weather',
        body: 'The site map (stages, bars, food, restrooms, entrances) and an hourly forecast for the festival hours, both cached for the field.',
      },
      {
        icon: '🤘',
        title: 'Journal',
        body: 'Rate the sets you saw as the week goes, then share your Rockstadt Rewind at the end of it.',
      },
    ],
  },
  {
    title: 'One tap deeper — under Options',
    items: [
      {
        icon: '🔔',
        title: 'Reminders & calendar',
        body: 'A notification a chosen number of minutes before each pick, or the whole line-up exported as calendar events with alarms.',
      },
      {
        icon: '👥',
        title: 'Crew',
        body: 'Overlay your friends’ picks — by shared link or by QR beam with no network at all — to find the sets you are all at and the gaps you can meet in.',
      },
      {
        icon: '🔋',
        title: 'Stamina',
        body: 'Five days on a field modelled as one battery: sleep, heat, walking and the last bus home, with the specific cuts that fix a bad day.',
      },
      {
        icon: '⏱',
        title: 'Running order',
        body: 'Log a stage running late or a band pulled and the whole app re-times itself — reminders included.',
      },
      {
        icon: '🎒',
        title: 'Bag',
        body: 'What gets through the gate and what gets turned away, ticked off as you pack and cross-checked against the forecast.',
      },
    ],
  },
  {
    title: 'Keeping it',
    items: [
      {
        icon: '⤓',
        title: 'Install it',
        body: 'Add the app to your home screen and it works offline on the grounds, patchy signal or none.',
      },
      {
        icon: '⤴',
        title: 'Share',
        body: 'Send your picks as an image or a link that reopens them exactly on another device — or hand the whole app over by QR.',
      },
      {
        icon: '⟳',
        title: 'Version',
        body: 'The footer carries the build stamp; tap it to check for a newer version or force one through when a cached copy gets stuck.',
      },
    ],
  },
];

let dialog: HTMLDialogElement | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/** Open the guide. Called on first run, and from the footer afterwards. */
export function openWelcome(): void {
  if (!dialog) dialog = buildDialog(seen());
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  markSeen();
}

/**
 * Show the guide once per device, on the first visit. Deliberately silent for
 * everyone else: returning visitors open it from the footer if they want it.
 */
export function maybeShowWelcome(): void {
  if (seen()) return;
  openWelcome();
}

function buildDialog(returning: boolean): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'welcome';
  d.setAttribute('aria-label', 'How this app works');

  const card = el('div', 'welcome-card');

  const head = el('div', 'welcome-head');
  const heading = el('div', 'welcome-heading');
  heading.appendChild(
    el('h2', 'welcome-title', returning ? 'How this works' : 'Welcome'),
  );
  heading.appendChild(
    el(
      'p',
      'welcome-sub',
      returning
        ? 'Every room in the app and the button that opens it.'
        : `Your ${FESTIVAL.dates} at ${FESTIVAL.name}, planned on one screen. Here is where everything lives.`,
    ),
  );
  head.appendChild(heading);

  const close = el('button', 'welcome-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close guide');
  close.addEventListener('click', () => d.close());
  head.appendChild(close);
  card.appendChild(head);

  const body = el('div', 'welcome-body');
  for (const section of SECTIONS) {
    const sec = el('section', 'welcome-section');
    sec.appendChild(el('h3', 'welcome-section-title', section.title));
    const list = el('ul', 'welcome-list');
    for (const item of section.items) {
      const li = el('li', 'welcome-item');
      li.appendChild(el('span', 'welcome-icon', item.icon));
      const text = el('div', 'welcome-text');
      text.appendChild(el('span', 'welcome-item-title', item.title));
      text.appendChild(el('span', 'welcome-item-body', item.body));
      li.appendChild(text);
      list.appendChild(li);
    }
    sec.appendChild(list);
    body.appendChild(sec);
  }
  card.appendChild(body);

  const foot = el('div', 'welcome-foot');
  foot.appendChild(
    el(
      'p',
      'welcome-foot-note',
      `Unofficial and community-built · this build ${buildLabel()}. Reopen this guide any time from the footer.`,
    ),
  );
  const go = el('button', 'welcome-go', returning ? 'Close' : 'Start planning');
  go.type = 'button';
  go.addEventListener('click', () => d.close());
  foot.appendChild(go);
  card.appendChild(foot);

  d.appendChild(card);
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });

  document.body.appendChild(d);
  return d;
}

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}
