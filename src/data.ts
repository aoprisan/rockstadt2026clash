import type { FestivalDay, Stage, StageId } from './types';

export const FESTIVAL = {
  name: 'Rockstadt Extreme Fest',
  edition: '12th Edition',
  location: 'Ghimbav · Brașov, Romania',
  dates: '27–31 July 2026',
};

/**
 * Bump whenever the running order below changes (a set added, dropped or
 * re-timed). Returning visitors whose last-seen stamp differs get a one-time
 * "running order updated" banner so stale plans don't go unnoticed.
 */
export const DATA_VERSION = '2026-07-31';

export const STAGES: Record<StageId, Stage> = {
  rugina: { id: 'rugina', name: 'Adrian Rugină Stage', color: '#7ec524' },
  brasov: { id: 'brasov', name: 'Brașov Stage', color: '#c026d3' },
  calmuc: { id: 'calmuc', name: 'Andrei Calmuc Stage', color: '#e2761b' },
};

// Transcribed from the official Rockstadt Extreme Fest 2026 day posters.
export const DAYS: FestivalDay[] = [
  {
    id: 'day1',
    label: 'Day 1',
    date: '2026-07-27',
    sets: {
      rugina: [
        { band: 'Reverse The Moment', start: '15:50', end: '16:35' },
        { band: 'Groza', start: '17:30', end: '18:15' },
        { band: 'Heaven Shall Burn', start: '19:15', end: '20:15' },
        { band: 'Sabaton', start: '21:30', end: '23:15' },
      ],
      brasov: [
        { band: 'Implant pentru Refuz', start: '16:40', end: '17:25' },
        { band: 'Creeper', start: '18:20', end: '19:10' },
        { band: 'Black Label Society', start: '20:20', end: '21:20' },
        { band: 'Marilyn Manson', start: '23:20', end: '00:50' },
      ],
      calmuc: [
        { band: 'Necrotted', start: '16:25', end: '17:10' },
        { band: 'Hackneyed', start: '17:40', end: '18:30' },
        { band: 'Vended', start: '19:00', end: '20:00' },
        { band: 'Majestica', start: '20:30', end: '21:30' },
        { band: 'Alcest', start: '22:00', end: '23:00' },
        { band: 'Death Angel', start: '23:30', end: '00:30' },
        { band: 'Fu Manchu', start: '01:00', end: '02:00' },
      ],
    },
  },
  {
    id: 'day2',
    label: 'Day 2',
    date: '2026-07-28',
    sets: {
      rugina: [
        { band: 'Elder', start: '15:50', end: '16:35' },
        { band: 'Bleed From Within', start: '17:35', end: '18:25' },
        { band: 'Igorrr', start: '19:25', end: '20:25' },
        { band: 'Hatebreed', start: '21:35', end: '22:35' },
        { band: 'Godsmack', start: '23:50', end: '01:10' },
      ],
      brasov: [
        { band: 'Rotheads', start: '15:00', end: '15:45' },
        { band: 'Gutalax', start: '16:40', end: '17:30' },
        { band: 'Orbit Culture', start: '18:30', end: '19:20' },
        { band: 'Nevermore', start: '20:30', end: '21:30' },
        { band: 'In Flames', start: '22:40', end: '23:45' },
      ],
      calmuc: [
        { band: 'Employed To Serve', start: '16:25', end: '17:10' },
        { band: 'Tribulation', start: '17:40', end: '18:30' },
        { band: 'Cryptopsy', start: '19:00', end: '20:00' },
        { band: 'Non Est Deus', start: '20:30', end: '21:30' },
        { band: 'Vader', start: '22:00', end: '23:00' },
        { band: 'Deafheaven', start: '23:30', end: '00:30' },
        { band: 'Grave', start: '01:00', end: '02:00' },
      ],
    },
  },
  {
    id: 'day3',
    label: 'Day 3',
    date: '2026-07-29',
    sets: {
      rugina: [
        { band: 'Annisokay', start: '15:50', end: '16:35' },
        { band: 'Municipal Waste', start: '17:35', end: '18:25' },
        { band: 'In Extremo', start: '19:25', end: '20:25' },
        { band: 'Arch Enemy', start: '21:35', end: '22:35' },
        { band: 'Lamb of God', start: '23:50', end: '01:10' },
      ],
      brasov: [
        { band: 'Allt', start: '15:00', end: '15:45' },
        { band: 'Immolation', start: '16:40', end: '17:30' },
        { band: 'Thy Art Is Murder', start: '18:30', end: '19:20' },
        { band: 'Accept', start: '20:30', end: '21:30' },
        { band: 'Slaughter To Prevail', start: '22:40', end: '23:45' },
      ],
      calmuc: [
        { band: 'Underwaves', start: '16:25', end: '17:10' },
        { band: 'Novembers Doom', start: '17:40', end: '18:30' },
        { band: 'Animals As Leaders', start: '19:00', end: '20:00' },
        { band: 'The Ghost Inside', start: '20:30', end: '21:30' },
        { band: 'Perturbator', start: '22:00', end: '23:00' },
        { band: 'Candlemass', start: '23:30', end: '00:30' },
        { band: 'Deicide', start: '01:00', end: '02:00' },
      ],
    },
  },
  {
    id: 'day4',
    label: 'Day 4',
    date: '2026-07-30',
    sets: {
      rugina: [
        { band: 'Raised By Owls', start: '15:20', end: '16:05' },
        { band: 'Fit For An Autopsy', start: '17:00', end: '17:45' },
        { band: 'Trooper', start: '18:45', end: '19:45' },
        { band: 'Helloween', start: '21:00', end: '23:00' },
        { band: 'Satyricon', start: '00:10', end: '01:10' },
      ],
      brasov: [
        // Pulled on 30 July: a band member is recovering and unable to travel.
        // Main Stage still opens at 15:20 with Raised By Owls, gates at 14:00.
        { band: 'Crippling Alcoholism', start: '14:30', end: '15:15', cancelled: 'health reasons' },
        { band: 'Serrabulho', start: '16:10', end: '17:00' },
        { band: 'Northlane', start: '17:50', end: '18:40' },
        { band: 'Airbourne', start: '19:50', end: '20:55' },
        { band: 'Amorphis', start: '23:10', end: '00:10' },
      ],
      calmuc: [
        { band: 'Machukha', start: '16:00', end: '16:45' },
        { band: 'Slow Crush', start: '17:15', end: '18:00' },
        { band: 'Monolord', start: '18:30', end: '19:20' },
        { band: 'Bucovina', start: '19:50', end: '20:40' },
        { band: 'Malevolence', start: '21:10', end: '22:10' },
        { band: 'Alexandra Căpitănescu', start: '22:40', end: '23:40' },
        { band: 'Coroner', start: '00:10', end: '01:10' },
        { band: 'Wolves In The Throne Room', start: '01:45', end: '02:45' },
      ],
    },
  },
  {
    id: 'day5',
    label: 'Day 5',
    date: '2026-07-31',
    sets: {
      rugina: [
        { band: 'Pârnaie', start: '15:00', end: '15:45' },
        { band: 'Decapitated', start: '16:40', end: '17:25' },
        // Swapped with Periphery on 31 July: flight delays held Periphery up, so
        // Hvnds takes this Main Stage hour and Periphery plays the 22:00 Calmuc
        // slot Hvnds had. Same two slots, traded — nothing else on the day moves.
        { band: 'Hvnds', start: '18:25', end: '19:25' },
        { band: 'Grandson', start: '20:40', end: '21:40' },
        { band: 'The Prodigy', start: '23:00', end: '00:30' },
      ],
      brasov: [
        { band: 'Signs Of The Swarm', start: '15:50', end: '16:35' },
        { band: 'Feuerschwanz', start: '17:30', end: '18:20' },
        { band: 'Carcass', start: '19:30', end: '20:35' },
        { band: 'The Gathering', start: '21:45', end: '22:50' },
        { band: 'Soulfly', start: '00:40', end: '01:40' },
      ],
      calmuc: [
        { band: 'Heavy//Hitter', start: '15:25', end: '16:05' },
        { band: 'Psychonaut', start: '16:25', end: '17:10' },
        { band: 'Voivod', start: '17:40', end: '18:30' },
        { band: 'Evergrey', start: '19:00', end: '20:00' },
        { band: 'Left To Die', start: '20:30', end: '21:30' },
        // See the Rugină stage above: Periphery and Hvnds traded slots on the day.
        { band: 'Periphery', start: '22:00', end: '23:00' },
        { band: 'Insomnium', start: '23:30', end: '00:30' },
        { band: 'Sventevith', start: '01:00', end: '02:00' },
      ],
    },
  },
];
