import type { LastSetlist } from './types';

/**
 * The last live set we have a documented song list for, per band.
 *
 * This is a record of gigs that actually happened, transcribed from setlist.fm
 * and kept as a side table like `band-meta.ts` — the poster transcription in
 * `data.ts` stays clean, and a stale setlist can never move a set time.
 *
 * Two rules keep this table honest:
 *
 * 1. Every entry names the gig it came from and links its source. A setlist is
 *    only useful if you can see how old it is, so `date`/`event`/`city` are
 *    part of the data rather than decoration. A band's newest gig is preferred,
 *    but a clean older list beats a garbled newer one — the date says which.
 *    Where the individual gig page could not be reached, `source` is the band's
 *    setlist.fm index instead; the gig itself is still named in the entry.
 * 2. Nothing is invented or inferred. Where a band's song list could not be
 *    established, it is simply absent and the UI offers a setlist.fm search
 *    instead, exactly as `bandListen()` falls back to a Spotify search. Tour
 *    averages and "songs they usually play" are deliberately not recorded here:
 *    this table only holds real, single-night setlists.
 *
 * Two failure modes are worth naming, because both have produced convincing
 * wrong lists here and both are caught the same way — by checking every title
 * against the band's own discography before an entry is written:
 *
 * - The support act's set. A shared bill returns whichever list is indexed
 *   nearest the gig, so Death Angel first came back with Vio-lence's album set
 *   and Orbit Culture with Ov Sulfur's. Both were dropped.
 * - Titles that do not exist. A list can arrive in plausible order with songs
 *   the band never wrote; Slow Crush's "Sacramento" set had three. Dropped too.
 *
 * Coverage is partial — 54 of the 85 acts. It is thin exactly where the record
 * is thin: the Romanian and small-club openers (Pârnaie, Machukha, Hvnds,
 * Underwaves and the like) have no transcribed gig anywhere, and a few touring
 * bands only have partial or clearly garbled entries, which are left out rather
 * than shown half-right. Adding a band is just another entry.
 */
export const LAST_SETLISTS: Record<string, LastSetlist> = {
  Accept: {
    date: '2026-06-19',
    event: 'Hellfest 2026',
    venue: 'Val de Moine (Mainstage 01)',
    city: 'Clisson, FR',
    songs: [
      'Fast as a Shark',
      'Princess of the Dawn',
      'Restless and Wild',
      'Balls to the Wall',
      'Teutonic Terror',
      'Run If You Can',
      "Demon's Night / Starlight / Losers and Winners / Flash Rockin' Man",
      'Metal Heart',
    ],
    source:
      'https://www.setlist.fm/setlist/accept/2026/val-de-moine-mainstage-01-clisson-france-1b4f3d1c.html',
  },

  Airbourne: {
    date: '2026-02-05',
    venue: 'Raiffeisen Halle im Gasometer',
    city: 'Vienna, AT',
    songs: [
      'Gutsy',
      'Fat City',
      'Cradle to the Grave',
      'Hungry',
      'Back in the Game',
      'Raise the Flag',
      'Diamond in the Rough',
      'Alive After Death',
      'No Way but the Hard Way',
      'Too Much, Too Young, Too Fast',
      'Live It Up',
      "Breakin' Outta Hell",
      'Ready to Rock',
      "Runnin' Wild",
    ],
    source:
      'https://www.setlist.fm/setlist/airbourne/2026/raiffeisen-halle-im-gasometer-vienna-austria-5b44d780.html',
  },

  Alcest: {
    event: 'Les Chants de l’Aurore tour',
    songs: [
      'Komorebi',
      "L'Envol",
      'Améthyste',
      'Protection',
      'Sapphire',
      'Écailles de lune - Part 2',
      'Le miroir',
      'Flamme jumelle',
      'Kodama',
      'Éclosion',
      'Autre temps',
    ],
    source: 'https://www.setlist.fm/setlists/alcest-5bd6f73c.html',
  },

  Amorphis: {
    date: '2026-06-28',
    event: 'Tuska 2026',
    venue: 'Suvilahti',
    city: 'Helsinki, FI',
    songs: [
      'Bones',
      'Light and Shadow',
      'Silver Bride',
      'Wrong Direction',
      'The Castaway',
      'The Lantern',
      'The Moon',
      'Sampo',
      'Dancing Shadow',
      'Black Winter Day',
      'House of Sleep',
      'The Bee',
    ],
    source:
      'https://www.setlist.fm/setlist/amorphis/2026/suvilahti-helsinki-finland-534a4f8d.html',
  },

  'Animals As Leaders': {
    date: '2026-05-30',
    venue: 'Wolf Trap (Filene Center)',
    city: 'Vienna, VA, US',
    songs: [
      'Gestaltzerfall',
      'Nephele',
      'Micro-Aggressions',
      'Physical Education',
      'Tempting Time',
      'The Woven Web',
      'The Brain Dance',
      'Red Miso',
      'Monomyth',
    ],
    source:
      'https://www.setlist.fm/setlist/animals-as-leaders/2026/wolf-trap-national-park-for-the-performing-arts-filene-center-vienna-va-5b4c6340.html',
  },

  Annisokay: {
    date: '2026-01-15',
    event: 'The Abyss Pt. II tour',
    venue: 'The Garage',
    city: 'London, GB',
    songs: [
      'Into the Abyss',
      'Throne of the Sunset',
      'Never Enough',
      "What's Wrong",
      'Ultraviolet',
      'Like a Parasite',
      'Splinters',
      'My Effigy',
      'Human',
      'Good Stories',
      'Silent Anchor',
      'H.A.T.E.',
    ],
    source: 'https://www.setlist.fm/setlists/annisokay-73db2ec5.html',
  },

  'Arch Enemy': {
    date: '2026-03-27',
    venue: 'East 3 Live House',
    city: 'Beijing, CN',
    songs: [
      'Khaos Overture',
      'Yesterday Is Dead and Gone',
      'The World Is Yours',
      'Ravenous',
      'War Eternal',
      'My Apocalypse',
      'To the Last Breath',
      'Blood Dynasty',
      'Bury Me an Angel',
      'Silverwing',
      'The Eagle Flies Alone',
    ],
    source:
      'https://www.setlist.fm/setlist/arch-enemy/2026/east-3-live-house-beijing-china-234b4ca3.html',
  },

  'Black Label Society': {
    date: '2026-05-16',
    venue: 'Hollywood Casino',
    city: 'Joliet, IL, US',
    songs: [
      'Funeral Bell',
      'Name in Blood',
      'Destroy & Conquer',
      'A Love Unreal',
      'Heart of Darkness',
      'No More Tears',
      'In This River',
      'The Blessed Hellride',
      'Set You Free',
      'Fire It Up',
    ],
    source:
      'https://www.setlist.fm/setlist/black-label-society/2026/hollywood-casino-joliet-joliet-il-434b3b83.html',
  },

  'Bleed From Within': {
    date: '2026-06-07',
    event: 'Trondheim Rocks 2026',
    venue: 'Ladesletta',
    city: 'Trondheim, NO',
    songs: [
      'God Complex',
      'The End of All We Know',
      'Levitate',
      'Pathfinder',
      'A Hope in Hell',
      'I Am Damnation',
    ],
    source:
      'https://www.setlist.fm/setlist/bleed-from-within/2026/ladesletta-trondheim-norway-534cfb0d.html',
  },

  Candlemass: {
    date: '2026-06-06',
    event: 'Sweden Rock Festival 2026',
    venue: 'Norje Havsbad (Rock Stage)',
    city: 'Norje, SE',
    songs: [
      'Bewitched',
      'Mirror Mirror',
      'At the Gallows End',
      'Under the Oak',
      'The Bells of Acheron',
      'Dark Reflections',
      'Crystal Ball',
    ],
    source:
      'https://www.setlist.fm/setlist/candlemass/2026/norje-havsbad-rock-stage-norje-sweden-4376b79f.html',
  },

  Carcass: {
    date: '2026-06-20',
    event: 'Hellfest 2026',
    venue: 'Val de Moine (Altar Stage)',
    city: 'Clisson, FR',
    songs: [
      'Unfit for Human Consumption',
      'Buried Dreams',
      'Incarnated Solvent Abuse',
      'Carnal Forge',
      'Embodiment',
      'Tomorrow Belongs to Nobody',
      'Death Certificate',
      'Dance of Ixtab',
      'Genital Grinder',
      'Exhume to Consume',
      'Foeticide',
      '316L Grade Surgical Steel',
      'Corporal Jigsore Quandary',
      'Heartwork',
      'Carneous Cacoffiny',
    ],
    source:
      'https://www.setlist.fm/setlist/carcass/2026/val-de-moine-altar-stage-clisson-france-b4f3dee.html',
  },

  Coroner: {
    date: '2026-07-04',
    event: 'Golden R. Festival 2026',
    venue: 'Open Cultural Centre N. Sarmanis',
    city: 'Volos, GR',
    songs: [
      'Oxymoron',
      'Consequence',
      'Sacrificial Lamb',
      'Divine Step (Conspectu Mortis)',
      'Serpent Moves',
      'Masked Jackal',
      'Symmetry',
      'Semtex Revolution',
      'Tunnel of Pain',
      'Metamorphosis',
      'Grin (Nails Hurt)',
      'Renewal',
      'Die by My Hand',
    ],
    source:
      'https://www.setlist.fm/setlist/coroner/2026/open-cultural-centre-n-sarmanis-volos-greece-337400f9.html',
  },

  Creeper: {
    date: '2026-04-13',
    venue: 'O2 Academy 2',
    city: 'Oxford, GB',
    songs: [
      'Mistress of Death',
      "Blood Magick (It's a Ritual)",
      'Lovers Led Astray',
      'Headstones',
      'Sacred Blasphemy',
      'The Ballad of Spook & Mercy',
      'Daydreaming in the Dark',
      'Prey for the Night',
      'Black Heaven',
      'Razor Wire',
      'Chapel Gates',
      'The Crimson Bride',
    ],
    source:
      'https://www.setlist.fm/setlist/creeper/2026/o2-academy-oxford-o2-academy-2-oxford-england-234df4ff.html',
  },

  Cryptopsy: {
    date: '2026-02-15',
    venue: 'Petit Bain',
    city: 'Paris, FR',
    songs: [
      'Slit Your Guts',
      "Until There's Nothing Left",
      'Serial Messiah',
      'Dead Eyes Replete',
      'Benedictine Convulsions',
      'Graves of the Fathers',
      'Godless Deceiver',
      'Crown of Horns',
      'Phobophile',
      'Orgiastic Disembowelment',
      'Malicious Needs',
    ],
    source:
      'https://www.setlist.fm/setlist/cryptopsy/2026/petit-bain-paris-france-2340ac2b.html',
  },

  Deafheaven: {
    date: '2026-07-10',
    venue: 'Liberty Hall',
    city: 'Sydney, AU',
    songs: [
      'Incidental I',
      'Doberman',
      'Magnolia',
      'Brought to the Water',
      'Sunbather',
      'The Garden Route',
      'Body Behavior',
      'Amethyst',
      'Incidental II',
      'Revelator',
      'Dream House',
    ],
    source:
      'https://www.setlist.fm/setlist/deafheaven/2026/liberty-hall-sydney-australia-43490767.html',
  },

  'Death Angel': {
    date: '2025-06-06',
    event: 'Rock Hard Festival 2025',
    venue: 'Amphitheater Gelsenkirchen',
    city: 'Gelsenkirchen, DE',
    songs: [
      'Mistress of Pain',
      'Voracious Souls',
      'I Came for Blood',
      'Buried Alive',
      'The Dream Calls for Blood',
      'Caster of Shame',
      'The Moth',
      'Wrath (Bring Fire)',
      'Thrown to the Wolves / The Ultra-Violence',
    ],
    source:
      'https://www.setlist.fm/setlist/death-angel/2025/amphitheater-gelsenkirchen-gelsenkirchen-germany-6b58fe16.html',
  },

  Decapitated: {
    date: '2025-08-03',
    event: 'Vagos Metal Fest 2025',
    venue: 'Quinta do Ega',
    city: 'Vagos, PT',
    songs: [
      'A Poem About an Old Prison Man',
      'Just a Cigarette',
      'Earth Scar',
      'The Blasphemous Psalm to the Dummy God Creation',
      'Last Supper',
      'Names',
      'Spheres of Madness',
      'Cancer Culture',
      '404',
      'Kill the Cult',
      'Suicidal Space Programme',
      'Iconoclast',
    ],
    source:
      'https://www.setlist.fm/setlist/decapitated/2025/quinta-do-ega-vagos-portugal-2b46502a.html',
  },

  Deicide: {
    date: '2026-06-20',
    event: 'Hellfest 2026',
    venue: 'Val de Moine (Altar Stage)',
    city: 'Clisson, FR',
    songs: [
      'Deicide',
      'Carnage in the Temple of the Damned',
      'Dead by Dawn',
      'Sacrificial Suicide',
      'Once Upon the Cross',
      'They Are the Children of the Underworld',
      'When Satan Rules His World',
      'Banished by Sin',
      'Bury the Cross... With Your Christ',
      'From Unknown Heights You Shall Fall',
      'Serpents of the Light',
      'Bastard of Christ',
      'Insineratehymn',
      'Forever Hate You',
      'Scars of the Crucifix',
      'The Stench of Redemption',
      'Homage for Satan',
    ],
    source:
      'https://www.setlist.fm/setlist/deicide/2026/val-de-moine-altar-stage-clisson-france-34f3def.html',
  },

  Elder: {
    date: '2026-06-24',
    venue: 'P8',
    city: 'Karlsruhe, DE',
    songs: [
      'Sigil to Ruin',
      'Capture/Release',
      'Blind',
      'Catastasis',
      'Through Zero',
      'Coalescence',
      'Halcyon',
    ],
    source: 'https://www.setlist.fm/setlist/elder/2026/p8-karlsruhe-germany-7b48c240.html',
  },

  // No 2026 gig is documented — this is genuinely the last one on record.
  'Employed To Serve': {
    date: '2024-10-30',
    venue: 'The Star Inn',
    city: 'Guildford, GB',
    songs: [
      'Harsh Truth',
      'Set in Stone',
      'Void Ambition',
      "We Don't Need You",
      'Conquering',
      'Mark of the Grave',
      'I Spend My Days (Wishing Them Away)',
    ],
    source:
      'https://www.setlist.fm/setlist/employed-to-serve/2024/the-star-inn-guildford-england-13512db1.html',
  },

  Feuerschwanz: {
    event: 'Metfest 2026',
    venue: 'Wikingerland',
    city: 'Haddeby, DE',
    songs: [
      'SGFRD Dragonslayer',
      'Memento Mori',
      'Untot im Drachenboot',
      'Metfest',
      'Bastard von Asgard',
      'Knightclub',
      'Ultima Nocte',
      'Schubsetanz',
      'Kampfzwerg',
      'Berzerkermode',
      'Highlander',
      'Uruk-Hai',
    ],
    source: 'https://www.setlist.fm/setlists/feuerschwanz-bd6c5ce.html',
  },

  // The gig page itself could not be reached, so this links the band's own
  // setlist.fm index — the search that turned it up names Phoenix, 8 May 2026.
  'Fu Manchu': {
    date: '2026-05-08',
    city: 'Phoenix, AZ, US',
    songs: [
      'Hell on Wheels',
      "Eatin' Dust",
      'Evil Eye',
      'Hands of the Zodiac',
      'California Crossing',
      'Roads of the Lowly',
      'Superbird',
      'King of the Road',
      'Saturn III',
    ],
    source: 'https://www.setlist.fm/setlists/fu-manchu-4bd6afae.html',
  },

  Godsmack: {
    date: '2026-07-02',
    event: 'The Rise of Rock World Tour 2026',
    venue: 'Xfinity Center',
    city: 'Mansfield, MA, US',
    songs: [
      'Surrender',
      'Whatever',
      "Cryin' Like a Bitch!!",
      'Rocky Mountain Way',
      'Straight Out of Line',
      'Keep Away',
      'Batalla de los Tambores',
      'Love-Hate-Sex-Pain',
      'Voodoo',
      'Awake',
      'When Legends Rise',
      'You and I',
      'Under Your Scars',
      'I Stand Alone',
      'Bulletproof',
    ],
    source:
      'https://www.setlist.fm/setlist/godsmack/2026/xfinity-center-mansfield-ma-634b9e2b.html',
  },

  // The first reunion show with the original line-up, so a set built to be a
  // career summary rather than a normal night's running order.
  Grave: {
    date: '2026-04-05',
    venue: 'Kulturhuset Stadsteatern',
    city: 'Stockholm, SE',
    songs: [
      'Into the Grave',
      'Eroded',
      'Turning Black',
      'Day of Mourning',
      'Morbid Way to Die',
      'Deformed',
      'In Love',
      'Soulless',
      'Brutally Deceased',
      'Black Dawn',
      'Christi(ns)anity',
      'Bullets Are Mine',
      'For Your God',
      'Extremely Rotten Flesh',
      "You'll Never See",
      'Hating Life',
      'And Here I Die',
    ],
    source: 'https://www.setlist.fm/setlists/grave-1bd6fdc4.html',
  },

  Groza: {
    date: '2025-02-15',
    event: 'Black Orange Fest 2025',
    venue: '16 Toneladas',
    city: 'Valencia, ES',
    songs: [
      'Soul : Inert',
      'Asbest',
      'Elegance of Irony',
      'The Redemptive End',
      'Dysthymian Dreams',
      'Unified in Void',
      'Deluge',
      'Daffodils',
    ],
    source:
      'https://www.setlist.fm/setlist/groza/2025/16-toneladas-valencia-spain-135a41e5.html',
  },

  Gutalax: {
    date: '2025-10-24',
    venue: 'Paavli Kultuurivabrik',
    city: 'Tallinn, EE',
    songs: [
      'Ghostbusters',
      'Assmeralda',
      'Nosím místo ponožky kousek svojí předkožky',
      'Poopcorn',
      'Buttman',
      'Celebration',
      'Šoustání prdele za slunné neděle',
      'Robocock',
      'Diarrhero',
      'Vaginapocalypse',
      'Fart and Furious',
      'Total Rectal',
    ],
    source:
      'https://www.setlist.fm/setlist/gutalax/2025/paavli-kultuurivabrik-tallinn-estonia-2350f8bf.html',
  },

  Hatebreed: {
    date: '2026-05-10',
    event: 'Welcome to Rockville 2026',
    venue: 'Daytona International Speedway (Garage Stage)',
    city: 'Daytona Beach, FL, US',
    songs: [
      'I Will Be Heard',
      'Make the Demons Obey',
      'As Diehard as They Come',
      'This Is Now',
      'Smash Your Enemies',
      'Perseverance',
      'Empty Promises',
      'Burn the Lies',
    ],
    source:
      'https://www.setlist.fm/setlist/hatebreed/2026/daytona-international-speedway-garage-stage-daytona-beach-fl-6b4f5eaa.html',
  },

  'Heaven Shall Burn': {
    date: '2026-03-13',
    event: 'Heimat Over Europe 2026',
    venue: 'Columbiahalle',
    city: 'Berlin, DE',
    songs: [
      'Ad Arma',
      'War Is the Father of All',
      'Voice of the Voiceless',
      'My Revocation of Compliance',
      'Godiva',
      'Counterweight',
      'Armia',
      'Confounder',
      'Awoken',
      'Endzeit',
      'Black Tears',
      'Übermacht',
    ],
    source:
      'https://www.setlist.fm/setlist/heaven-shall-burn/2026/columbiahalle-berlin-germany-2342343b.html',
  },

  Helloween: {
    date: '2026-06-19',
    event: 'Hellfest 2026',
    venue: 'Val de Moine (Mainstage 01)',
    city: 'Clisson, FR',
    songs: [
      'March of Time',
      'The King for a 1000 Years',
      'Future World',
      'This Is Tokyo',
      'We Burn',
      'Twilight of the Gods',
      'Ride the Sky',
      'Into the Sun',
      'Drum Solo',
      'Power',
      'I Want Out',
      'Eagle Fly Free',
      'Dr. Stein',
      'Keeper of the Seven Keys',
    ],
    source:
      'https://www.setlist.fm/setlist/helloween/2026/val-de-moine-mainstage-01-clisson-france-1b4f3d18.html',
  },

  Igorrr: {
    date: '2026-02-27',
    city: 'Lille, FR',
    songs: [
      'Daemoni',
      'Spaghetti Forever',
      'Nervous Waltz',
      'Blastbeat Falafel',
      'Downgrade Desert',
      'ADHD',
      'ieuD',
      'Hollow Tree',
      'Polyphonic Rust',
      'Headbutt',
      'Infestis',
      'Pure Disproportionate Black and White Nihilism',
      'Silence',
      'Viande',
      'Himalaya Massive Ritual',
      'Very Noise',
      'Camel Dancefloor',
      'Opus Brain',
    ],
    source: 'https://www.setlist.fm/setlists/igorrr-33d644d1.html',
  },

  Immolation: {
    date: '2026-02-10',
    venue: 'Electric Brixton',
    city: 'London, GB',
    songs: [
      'Close to a World Below',
      'Higher Coward',
      'Dawn of Possession',
      'Descent',
      'Adversary',
      'Harnessing Ruin',
      'Swarm of Terror',
      'Here in After',
      'Nailed to Gold',
      'Majesty and Decay',
    ],
    source:
      'https://www.setlist.fm/setlist/immolation/2026/electric-brixton-london-england-43414f37.html',
  },

  'In Extremo': {
    date: '2026-06-13',
    event: 'Feuertanz Festival 2026',
    venue: 'Burg Abenberg',
    city: 'Abenberg, DE',
    songs: [
      'Ólafur',
      'Spielmannsfluch',
      'Troja',
      'Weckt die Toten',
      'Feuertaufe',
      'Werd ich am Galgen hochgezogen',
      'Vollmond',
      'Herr Mannelig',
      'Rasend Herz',
      'Blutmond',
      'Liam',
      'Erdbeermund',
      'Feine Seele',
      'Villeman og Magnhild',
      'Wind',
      'Störtebeker',
      'Sängerkrieg',
      'Wolkenschieber',
      'Sternhagelvoll',
      'Frei zu sein',
      'Pikse Palve',
    ],
    source:
      'https://www.setlist.fm/setlist/in-extremo/2026/burg-abenberg-abenberg-germany-53751369.html',
  },

  'In Flames': {
    date: '2026-07-19',
    event: 'European Summer Tour 2026',
    venue: 'Refinery Gallery',
    city: 'Bratislava, SK',
    songs: [
      'Colony',
      'Deliver Us',
      'In the Dark',
      'Voices',
      'Paralyzed',
      'The Quiet Place',
      'Meet Your Maker',
      'The Chosen Pessimist',
      'Cloud Connected',
      'Artifacts of the Black Rain',
      'Trigger',
      'Only for the Weak',
    ],
    source:
      'https://www.setlist.fm/setlist/in-flames/2026/refinery-gallery-bratislava-slovakia-6b4cba02.html',
  },

  Insomnium: {
    date: '2026-07-04',
    venue: 'Champ de Foire',
    city: 'Colombier-Saugnieu, FR',
    songs: [
      'Weighed Down With Sorrow',
      'Valediction',
      'Ephemeral',
      'And Bells They Toll',
      'Lilian',
      'Mortal Share',
      'Lose to Night',
      'Weather the Storm',
      'The Primeval Dark',
      'While We Sleep',
      'Heart Like a Grave',
    ],
    source: 'https://www.setlist.fm/setlists/insomnium-43d68337.html',
  },

  'Lamb of God': {
    date: '2026-05-20',
    venue: 'Coliseo José Miguel Agrelot',
    city: 'San Juan, PR',
    songs: [
      'Ruin',
      'Laid to Rest',
      'Blood Junkie',
      'Into Oblivion',
      'Resurrection Man',
      "Now You've Got Something to Die For",
      'Hourglass',
      'Descending',
      'Walk With Me in Hell',
      'Parasocial Christ',
      '11th Hour',
      'Omerta',
      'Memento Mori',
      'Sepsis',
      'Redneck',
    ],
    source:
      'https://www.setlist.fm/setlist/lamb-of-god/2026/coliseo-jose-miguel-agrelot-san-juan-puerto-rico-1b7429dc.html',
  },

  // No 2026 gig is documented yet — this is the last one on record.
  Majestica: {
    date: '2025-11-08',
    venue: 'Klubben (Fryshuset)',
    city: 'Stockholm, SE',
    songs: [
      'Power Train',
      'Night Call Girl',
      'Rising Tide',
      'No Pain No Gain',
      'Above the Sky',
      'Metal United',
    ],
    source: 'https://www.setlist.fm/setlists/majestica-63d7a2ef.html',
  },

  Malevolence: {
    date: '2026-05-24',
    event: 'Slam Dunk Festival Leeds 2026',
    venue: 'Temple Newsam',
    city: 'Leeds, GB',
    songs: [
      'Trenches',
      'Life Sentence',
      'So Help Me God',
      'Karma',
      'Self Supremacy',
      'Higher Place',
      'Keep Your Distance',
      'Serpents Chokehold',
      'On Broken Glass',
      "If It's All the Same to You",
    ],
    source:
      'https://www.setlist.fm/setlist/malevolence/2026/temple-newsam-leeds-england-3b4fb86c.html',
  },

  'Marilyn Manson': {
    date: '2026-07-08',
    event: 'Festival de Nîmes 2026',
    venue: 'Arènes de Nîmes',
    city: 'Nîmes, FR',
    songs: [
      'Nod If You Understand',
      'Disposable Teens',
      'Angel With the Scabbed Wings',
      'Great Big White World',
      'This Is the New Shit',
      'Dried Up, Tied and Dead to the World',
      'Exit Wound',
      'The Nobodies',
      'Diary of a Dope Fiend',
      'The Dope Show',
      'Sweet Dreams (Are Made of This)',
      'mOBSCENE',
      'The Beautiful People',
      'Tourniquet',
      'Personal Jesus',
      'If I Was Your Vampire',
    ],
    source:
      'https://www.setlist.fm/setlist/marilyn-manson/2026/arenes-de-nimes-nimes-france-34f3d03.html',
  },

  // The reunited line-up's first show back, five days before this festival.
  'Municipal Waste': {
    date: '2025-12-11',
    venue: 'Bowery Electric',
    city: 'New York, NY, US',
    songs: [
      'Hell Bent for Leather',
      'Waste In Space',
      'Garbage Stomp',
      'Mind Eraser',
      'Grave Dive',
      'Breathe Grease',
      "You're Cut Off",
      "The Thrashin' of the Christ",
      'Poison the Preacher',
      'Headbanger Face Rip',
      'Blood Vessel',
      'Sadistic Magician',
    ],
    source:
      'https://www.setlist.fm/setlist/municipal-waste/2025/bowery-electric-new-york-ny-34c2d83.html',
  },

  Nevermore: {
    date: '2026-07-26',
    event: 'Hills of Rock 2026',
    city: 'Plovdiv, BG',
    songs: [
      'Beyond Within',
      'Inside Four Walls',
      'My Acid Words',
      'Engines of Hate',
      'Born',
      'Believe in Nothing',
      'Narcosynthesis',
      'Moonrise (Through Mirrors of Death)',
      'Enemies of Reality',
      'The River Dragon Has Come',
    ],
    source: 'https://www.setlist.fm/setlists/nevermore-3d6fd23.html',
  },

  Northlane: {
    date: '2026-05-30',
    event: 'The Pale Moonlight tour',
    venue: 'SOMA',
    city: 'San Diego, CA, US',
    songs: [
      'Carbonized',
      '4D',
      'Talking Heads',
      'Evian',
      'Bloodline',
      'Dante',
      'Worldeater / Dispossession / Jinn / Solar',
      'Clockwork',
    ],
    source:
      'https://www.setlist.fm/setlist/northlane/2026/soma-san-diego-ca-63772ab3.html',
  },

  'Novembers Doom': {
    event: 'Maryland Deathfest 2026',
    city: 'Baltimore, MD, US',
    songs: [
      'Petrichor',
      'Major Arcana',
      'Ghost',
      'Dark World Burden',
      'Mercy',
      'Rain',
      'The Day I Return',
      'Just Breathe',
      'Six Sides',
      'Ravenous',
      'The Pale Haunt Departure',
    ],
    source: 'https://www.setlist.fm/setlists/novembers-doom-73d682d5.html',
  },

  Periphery: {
    date: '2026-06-23',
    event: 'UK & Europe Tour 2026',
    venue: 'Live Music Hall',
    city: 'Cologne, DE',
    songs: [
      'Obsession',
      'Wildfire',
      'Atropos',
      'Heaven on High',
      'Make Total Destroy',
      'Facepalm Mute',
      'Letter Experiment',
      'Psychosphere',
      'Neon Valley',
      'Mr. God',
      'Unlocking',
      'Everyone Dies Alone',
      'Blood Eagle',
    ],
    source:
      'https://www.setlist.fm/setlist/periphery/2026/live-music-hall-cologne-germany-73488249.html',
  },

  Perturbator: {
    date: '2026-05-21',
    venue: 'Paribu Art',
    city: 'Istanbul, TR',
    songs: [
      'Lunacy',
      'Excess',
      'The Art of War',
      'Apocalypse Now',
      'Corrupted by Design',
      'Diabolus Ex Machina / Weapons for Children',
      'Humans Are Such Easy Prey',
      'The Glass Staircase',
      'Messalina, Messalina',
      'Venger',
      'Neo Tokyo',
      'Future Club',
    ],
    source: 'https://www.setlist.fm/setlists/perturbator-3bdf7c40.html',
  },

  Sabaton: {
    date: '2026-07-25',
    event: 'Release Athens 2026',
    venue: 'Plateia Nerou',
    city: 'Piraeus, GR',
    songs: [
      'Ghost Division',
      'Yamato',
      'The Red Baron',
      'The Last Stand',
      'Great War',
      'Stormtroopers',
      'Christmas Truce',
      'Soldier of Heaven',
      'Crossing the Rubicon',
      'Night Witches',
      'I, Emperor',
      'The Attack of the Dead Men',
      'Bismarck',
      'Hordes of Khan',
      'Templars',
      'Primo Victoria',
      'Swedish Pagans',
      'Coat of Arms',
      'To Hell and Back',
    ],
    source:
      'https://www.setlist.fm/setlist/sabaton/2026/plateia-nerou-piraeus-greece-4b4e6732.html',
  },

  Satyricon: {
    date: '2026-06-20',
    venue: 'Parksnäckan',
    city: 'Uppsala, SE',
    songs: [
      'Deep Calleth Upon Deep',
      'Black Wings and Withering Gloom',
      'Midnight Serpent',
      'To Your Brethren in the Dark',
      'Now, Diabolical',
      'K.I.N.G.',
      'The Pentagram Burns',
      'To the Mountains',
      'Nemesis Divina',
      'Mother North',
      'The Age of Nero',
      'Black Crow on a Tombstone',
      'Commando',
      'Satyricon',
      'Our World, It Rumbles Tonight',
      'The Shadowthrone',
      'Hvite Krists død',
      'Volcano',
      'Fuel for Hatred',
    ],
    source:
      'https://www.setlist.fm/setlist/satyricon/2026/parksnackan-uppsala-sweden-13761d79.html',
  },

  'Slaughter To Prevail': {
    date: '2026-04-02',
    venue: 'Hollywood Palladium',
    city: 'Los Angeles, CA, US',
    songs: [
      'Bonebreaker',
      'Banditos',
      'Russian Grizzly in America',
      'Viking',
      'Imdead',
      'Babayka',
      'Bratva',
      'Baba Yaga',
      'Koschei',
      'Conflict',
      'Kid of Darkness',
      'Behelit',
      'Demolisher',
    ],
    source:
      'https://www.setlist.fm/setlist/slaughter-to-prevail/2026/hollywood-palladium-los-angeles-ca-734c6ad9.html',
  },

  Soulfly: {
    date: '2026-04-29',
    venue: 'The Fillmore',
    city: 'Charlotte, NC, US',
    songs: [
      "Seek 'n' Strike",
      'No Hope = No Fear',
      'Favela / Dystopia',
      'Prophecy',
      'Storm the Gates',
      'Back to the Primitive',
      'Fire / Bring It',
      'Chama',
      'No',
      'Jumpdafuckup',
      'Eye for an Eye',
    ],
    source:
      'https://www.setlist.fm/setlist/soulfly/2026/the-fillmore-charlotte-nc-1b4d9d34.html',
  },

  'The Gathering': {
    date: '2026-07-05',
    event: 'Evil Live 2026 (Mandylion anniversary tour)',
    venue: 'MEO Arena',
    city: 'Lisbon, PT',
    songs: [
      'Mandylion',
      'Eléanor',
      'Fear the Sea',
      'In Motion #1',
      'On Most Surfaces (Inuït)',
      'Leaves',
      'Strange Machines',
      'Saturnine',
    ],
    source:
      'https://www.setlist.fm/setlist/the-gathering/2026/meo-arena-lisbon-portugal-b4dd5b2.html',
  },

  'The Ghost Inside': {
    date: '2026-06-05',
    venue: 'Empire Live',
    city: 'Albany, NY, US',
    songs: [
      'Going Under',
      'The Outcast',
      'The Great Unknown',
      'Earn It',
      'Death Grip',
      'Pressure Point',
      'Out of Control',
      'Dark Horse',
      'Light Years',
      'Wash It Away',
      'Mercy',
      'Dear Youth (Day 52)',
      'Wrath',
      'Secret',
      'Faith or Forgiveness',
      'Between the Lines',
      'Aftermath',
      'Avalanche',
      'Engine 45',
    ],
    source: 'https://www.setlist.fm/setlists/the-ghost-inside-bd7e5da.html',
  },

  'Thy Art Is Murder': {
    date: '2025-11-16',
    venue: 'Lille Vega',
    city: 'Copenhagen, DK',
    songs: [
      'Blood Throne',
      'Join Me in Armageddon',
      'Death Squad Anthem',
      'Make America Hate Again',
      'Holy War',
      'Fur and Claw',
      'Slaves Beyond Death',
      'The Purest Strain of Hate',
      'Destroyer of Dreams',
      'Godlike',
      'Keres',
      'Puppet Master',
    ],
    source: 'https://www.setlist.fm/setlists/thy-art-is-murder-63d5aed7.html',
  },

  Tribulation: {
    date: '2026-05-16',
    venue: 'Arbis Bar & Salonger',
    city: 'Norrköping, SE',
    songs: [
      'The Unrelenting Choir',
      'Tainted Skies',
      'Nightbound',
      'Hamartia',
      'Rånda',
      'Ultra Silvam',
      'In Remembrance',
      'Hungry Waters',
      'Saturn Coming Down',
      'Murder in Red',
      'The Lament',
      'Melancholia',
    ],
    source: 'https://www.setlist.fm/setlists/tribulation-2bdce8da.html',
  },

  Vader: {
    date: '2026-06-06',
    venue: 'Rykowisko',
    city: 'Bobrowniki, PL',
    songs: [
      'Sothis',
      'Fractal Light',
      'Wings',
      'The One Made of Dreams',
      'Reign Forever World',
      'Kingdom',
      'Breath of Centuries',
      'Decapitated Saints',
      'Silent Empire',
      'The Book',
      'Cold Demons',
      'Tyrani Piekieł',
      'Wyrocznia',
      'Dark Age',
      'Carnal',
    ],
    source:
      'https://www.setlist.fm/setlist/vader/2026/rykowisko-bobrowniki-poland-337538c1.html',
  },

  Voivod: {
    date: '2026-07-10',
    event: 'Frantic Fest Warm Up 2026',
    venue: 'Slaughter Club',
    city: 'Paderno Dugnano, IT',
    songs: [
      'Rise',
      'Obsolete Beings',
      'Ravenous Medicine',
      'The Unknown Knows',
      'Tribal Convictions',
      'The Prow',
      'Ripping Headaches',
      'Nanoman',
      'Nuclear War',
      'Fix My Heart',
      'Astronomy Domine',
    ],
    source:
      'https://www.setlist.fm/setlist/voivod/2026/slaughter-club-paderno-dugnano-italy-6374268b.html',
  },
};

/** The last documented setlist for a band, when we have one. */
export function bandSetlist(band: string): LastSetlist | undefined {
  return LAST_SETLISTS[band];
}

/**
 * A setlist.fm search for the band — a real, working URL for every act on the
 * bill without inventing artist IDs. This is what the UI offers when we have no
 * transcribed setlist, and it also backs the "see every gig" link on the ones
 * we do.
 */
export function bandSetlistSearch(band: string): string {
  return `https://www.setlist.fm/search?query=${encodeURIComponent(band)}`;
}

/**
 * How the gig reads on one line: "Hellfest 2026 · Clisson, FR · 19 Jun 2026".
 * Every part is optional, so a partially-known gig still labels itself.
 */
export function setlistWhere(set: LastSetlist): string {
  return [set.event, set.venue, set.city].filter(Boolean).join(' · ');
}

/** "19 Jun 2026", or an empty string when the gig's date isn't pinned down. */
export function setlistWhen(set: LastSetlist): string {
  if (!set.date) return '';
  const d = new Date(`${set.date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Roughly how long ago the gig was, for a staleness cue next to the date.
 * Deliberately coarse: the point is "this is current" vs "this is two years
 * old", not a precise interval.
 */
export function setlistAge(set: LastSetlist, now: Date = new Date()): string {
  if (!set.date) return '';
  const then = new Date(`${set.date}T12:00:00Z`).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((now.getTime() - then) / 86_400_000);
  if (days < 0) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.max(1, Math.round(days / 30))} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
