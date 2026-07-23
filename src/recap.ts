import { DAYS, FESTIVAL } from './data';
import type { SetSlot, StageId } from './types';
import { fmtDuration } from './schedule';
import { unionMinutes } from './stats';
import { note, rating, seenSlots } from './journal';
import {
  COLORS,
  SHARE_URL,
  drawPill,
  roundRect,
  sharePngBlob,
  truncate,
  type ShareResult,
} from './share';

/**
 * "My Rockstadt Rewind" — a Wrapped-style recap of the festival you actually
 * had, rendered to a shareable PNG: sets seen, hours in front of a stage, your
 * top-rated podium and the genres that defined your week. Built entirely from
 * the on-device journal; works mid-festival as a running tally.
 */

const FILE_NAME = 'rockstadt-2026-rewind.png';

export async function shareRecap(): Promise<ShareResult> {
  const seen = seenSlots(Date.now());
  if (seen.length === 0) return { outcome: 'empty' };
  const blob = await renderRecapPng(seen);
  return sharePngBlob(blob, FILE_NAME, {
    title: `My ${FESTIVAL.name} 2026 Rewind`,
    text: `My ${FESTIVAL.name} 2026 so far — ${SHARE_URL}`,
  });
}

function renderRecapPng(seen: SetSlot[]): Promise<Blob> {
  // ---- the numbers ----
  const byDay = new Map<string, SetSlot[]>();
  for (const s of seen) {
    const list = byDay.get(s.dayId) ?? [];
    list.push(s);
    byDay.set(s.dayId, list);
  }
  let musicMin = 0;
  for (const list of byDay.values()) musicMin += unionMinutes(list);

  const rated = seen
    .filter((s) => rating(s.id) > 0)
    .sort(
      (a, b) => rating(b.id) - rating(a.id) || b.end - b.start - (a.end - a.start),
    );
  const podium = rated.slice(0, 3);

  const genreCount = new Map<string, number>();
  for (const s of seen) {
    if (!s.genre) continue;
    genreCount.set(s.genre, (genreCount.get(s.genre) ?? 0) + 1);
  }
  const topGenres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const perStage: Record<StageId, number> = { rugina: 0, brasov: 0, calmuc: 0 };
  for (const s of seen) perStage[s.stage.id] += 1;

  const bestDay = [...byDay.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const bestDayLabel = bestDay
    ? `${DAYS.find((d) => d.id === bestDay[0])?.label ?? ''} (${bestDay[1].length} sets)`
    : '';

  // The note on your top-rated set makes the card personal — best quote wins.
  const quote = podium.map((s) => ({ band: s.band, text: note(s.id) })).find((q) => q.text);

  // ---- layout ----
  const W = 560;
  const PAD = 28;
  const HEADER_H = 138;
  const TILES_H = 96;
  const PODIUM_HEAD_H = 34;
  const PODIUM_ROW_H = 46;
  const QUOTE_H = quote ? 44 : 0;
  const GENRE_H = topGenres.length > 0 ? 34 + topGenres.length * 26 : 0;
  const STAGE_H = 56;
  const FOOTER_H = 64;
  const podiumH = podium.length > 0 ? PODIUM_HEAD_H + podium.length * PODIUM_ROW_H : 0;
  const H = HEADER_H + TILES_H + podiumH + QUOTE_H + GENRE_H + STAGE_H + FOOTER_H;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(0.55, COLORS.bgBottom);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // header
  const nameGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  nameGrad.addColorStop(0, COLORS.rugina);
  nameGrad.addColorStop(0.55, COLORS.brasov);
  nameGrad.addColorStop(1, COLORS.calmuc);
  ctx.fillStyle = nameGrad;
  ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('MY ROCKSTADT REWIND', PAD, 56);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(
    truncate(ctx, `${FESTIVAL.name} · ${FESTIVAL.dates} · ${FESTIVAL.location}`, W - 2 * PAD),
    PAD,
    80,
  );

  let pillX = PAD;
  const pillY = 100;
  pillX = drawPill(
    ctx,
    pillX,
    pillY,
    `${byDay.size} day${byDay.size === 1 ? '' : 's'} in the pit`,
    COLORS.text,
    COLORS.line,
    COLORS.panel,
  );
  if (bestDayLabel) {
    drawPill(
      ctx,
      pillX + 8,
      pillY,
      `Biggest: ${bestDayLabel}`,
      COLORS.text,
      COLORS.line,
      COLORS.panel,
    );
  }

  // headline tiles
  let y = HEADER_H;
  const tileW = (W - 2 * PAD - 16) / 2;
  drawTile(ctx, PAD, y, tileW, 84, String(seen.length), seen.length === 1 ? 'set seen' : 'sets seen');
  drawTile(ctx, PAD + tileW + 16, y, tileW, 84, fmtDuration(musicMin), 'of live music');
  y += TILES_H;

  // podium
  if (podium.length > 0) {
    ctx.fillStyle = COLORS.text;
    ctx.font = '800 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Top of my festival', PAD, y + 20);
    y += PODIUM_HEAD_H;
    const medals = ['🥇', '🥈', '🥉'];
    podium.forEach((slot, i) => {
      const rowY = y + i * PODIUM_ROW_H;
      roundRect(ctx, PAD, rowY, W - 2 * PAD, PODIUM_ROW_H - 8, 10);
      ctx.fillStyle = COLORS.panel;
      ctx.fill();
      roundRect(ctx, PAD, rowY, 5, PODIUM_ROW_H - 8, 2.5);
      ctx.fillStyle = COLORS[slot.stage.id];
      ctx.fill();

      ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(medals[i], PAD + 14, rowY + 26);
      ctx.fillStyle = COLORS.text;
      ctx.font = '800 16px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(truncate(ctx, slot.band, W - 2 * PAD - 180), PAD + 44, rowY + 26);

      ctx.textAlign = 'right';
      ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('🤘'.repeat(rating(slot.id)), W - PAD - 12, rowY + 26);
      ctx.textAlign = 'left';
    });
    y += podium.length * PODIUM_ROW_H;
  }

  if (quote) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = 'italic 600 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(
      truncate(ctx, `“${quote.text}” — on ${quote.band}`, W - 2 * PAD),
      PAD,
      y + 22,
    );
    y += QUOTE_H;
  }

  // genres
  if (topGenres.length > 0) {
    ctx.fillStyle = COLORS.text;
    ctx.font = '800 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('My week sounded like', PAD, y + 20);
    y += 34;
    const maxCount = topGenres[0][1];
    for (const [genre, count] of topGenres) {
      const barW = 150 * (count / maxCount);
      roundRect(ctx, PAD, y + 6, barW, 10, 5);
      ctx.fillStyle = nameGrad;
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(
        truncate(ctx, `${genre} × ${count}`, W - 2 * PAD - 170),
        PAD + 162,
        y + 16,
      );
      y += 26;
    }
  }

  // stage split
  const stages: Array<[StageId, string]> = [
    ['rugina', 'Adrian Rugină'],
    ['brasov', 'Brașov'],
    ['calmuc', 'Andrei Calmuc'],
  ];
  let sx = PAD;
  const sy = y + 30;
  for (const [id, label] of stages) {
    ctx.beginPath();
    ctx.arc(sx + 6, sy - 5, 6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[id];
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    const text = `${label} ${perStage[id]}`;
    ctx.fillText(text, sx + 18, sy);
    sx += 18 + ctx.measureText(text).width + 22;
  }
  y += STAGE_H;

  // footer
  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('My festival, from the unofficial clashfinder journal', W / 2, H - 36);
  ctx.fillStyle = COLORS.brasov;
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(SHARE_URL.replace(/^https?:\/\//, ''), W / 2, H - 18);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  num: string,
  label: string,
): void {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = COLORS.text;
  ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(num, x + 18, y + 42);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(label, x + 18, y + 64);
}
