import {
  bandSetlist,
  bandSetlistSearch,
  setlistAge,
  setlistWhen,
  setlistWhere,
} from './setlists';

/**
 * "♫ Setlist" — what a band actually played the last time we have a record of.
 *
 * This exists to settle clashes. Two bands at once and no strong feeling either
 * way is the normal state at a five-day festival; knowing that one of them
 * opened with the song you came for, and the other is deep in new-album
 * material, is usually enough to decide.
 *
 * It is history, not a promise: the panel leads with when and where the gig was
 * so a two-year-old list is obviously a two-year-old list. Where we have no
 * transcription at all the panel says so plainly and hands off to setlist.fm
 * rather than guessing.
 */

let dialog: HTMLDialogElement | null = null;
let panelBand = '';

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

export function openSetlist(band: string): void {
  panelBand = band;
  if (!dialog) dialog = buildDialog();
  repaint();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'setlist';
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  document.body.appendChild(d);
  return d;
}

function repaint(): void {
  if (!dialog) return;
  dialog.innerHTML = '';

  const card = el('div', 'setlist-card');

  const head = el('div', 'setlist-head');
  const titles = el('div');
  titles.appendChild(el('h2', 'setlist-title', panelBand));
  titles.appendChild(el('p', 'setlist-kicker', 'Last known live setlist'));
  head.appendChild(titles);

  const close = el('button', 'setlist-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => dialog?.close());
  head.appendChild(close);
  card.appendChild(head);

  const body = el('div', 'setlist-body');
  const set = bandSetlist(panelBand);

  if (!set) {
    body.appendChild(
      el(
        'p',
        'setlist-empty',
        `No setlist for ${panelBand} has been transcribed yet — better nothing than a guessed one. setlist.fm may have a gig on record.`,
      ),
    );
  } else {
    // Lead with the gig, because that is what makes the list interpretable.
    const gig = el('div', 'setlist-gig');
    const where = setlistWhere(set);
    if (where) gig.appendChild(el('span', 'setlist-where', where));

    const when = setlistWhen(set);
    if (when) {
      const line = el('div', 'setlist-when');
      line.appendChild(el('span', 'setlist-date', when));
      const age = setlistAge(set);
      if (age) {
        const chip = el('span', 'setlist-age', age);
        // A list older than roughly a touring cycle is unlikely to survive to
        // the stage intact, so let it read as dated rather than authoritative.
        if (/months|years/.test(age)) chip.classList.add('is-stale');
        line.appendChild(chip);
      }
      gig.appendChild(line);
    }
    body.appendChild(gig);

    body.appendChild(
      el(
        'p',
        'setlist-count',
        `${set.songs.length} song${set.songs.length === 1 ? '' : 's'}`,
      ),
    );

    const list = el('ol', 'setlist-songs');
    for (const song of set.songs) {
      list.appendChild(el('li', 'setlist-song', song));
    }
    body.appendChild(list);

    const src = el('a', 'setlist-link', 'Source on setlist.fm ↗');
    src.setAttribute('href', set.source);
    src.setAttribute('target', '_blank');
    src.setAttribute('rel', 'noopener noreferrer');
    body.appendChild(src);
  }

  const all = el('a', 'setlist-link', `Every ${panelBand} gig on setlist.fm ↗`);
  all.setAttribute('href', bandSetlistSearch(panelBand));
  all.setAttribute('target', '_blank');
  all.setAttribute('rel', 'noopener noreferrer');
  body.appendChild(all);

  body.appendChild(
    el(
      'p',
      'setlist-note',
      'A record of one past gig, not the running order for this one — bands change the set between shows.',
    ),
  );

  card.appendChild(body);
  dialog.appendChild(card);
}
