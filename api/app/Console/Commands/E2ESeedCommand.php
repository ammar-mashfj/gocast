<?php

namespace App\Console\Commands;

use App\Models\AutodjSlot;
use App\Models\Plan;
use App\Models\Playlist;
use App\Models\Station;
use App\Models\Track;
use App\Models\User;
use App\Services\PlaylistTracks;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Random\Engine\Mt19937;
use Random\Randomizer;
use RuntimeException;

/**
 * Recreates the keeper accounts the Playwright capture specs sign in as
 * (dashboard-visual, help-screenshots, create-station).
 *
 * The help account (help@gocast.test, "Night Shift Radio") is the one the
 * /help screenshots are taken from, so it reads like a real station: real
 * artwork, believable track and artist names, a week of programming and a
 * few months of shows and listeners. The visual-pass account (shell@) keeps
 * the awkward data on purpose — the Arabic title, the 120-character name,
 * the empty playlist — because that is what a design check should see.
 *
 * Local/testing only, like e2e:auth, whose `delete` action it reuses so an
 * account is removed exactly the way that command removes one. Running it
 * twice gives the same accounts: each is force-deleted (its station, tracks,
 * playlists, slots, shows and listener rows go with it by cascade) and built
 * again.
 *
 * No container is ever started. A Station is created with desired_state
 * stopped, StationObserver has no `created` hook (starting is the power
 * button's job, StationLifecycleService), and its `updated` hook only reaches
 * LiquidsoapSupervisor::up() for a running station — nothing here updates a
 * station after it is created. Tracks are rows only: nothing reads the audio
 * file until a container plays it, so no file is written.
 */
#[Signature('e2e:seed
    {--password=Password123! : Password for every seeded account}
    {--clean-throwaway : Also delete the share-check@ and dbl-check@ throwaway accounts}')]
#[Description('Local-only: recreate the keeper accounts the Playwright capture specs use')]
class E2ESeedCommand extends Command
{
    public const PRO_EMAIL = 'shell@gocast.test';

    public const FREE_EMAIL = 'free@gocast.test';

    public const NEW_EMAIL = 'create@gocast.test';

    public const HELP_EMAIL = 'help@gocast.test';

    public const HELP_SLUG = 'night-shift-radio';

    public const BLOG_EMAIL = 'blog@gocast.test';

    public const BLOG_SLUG = 'riverside-radio';

    public const PRO_SLUG = 'night-shift-shell';

    public const FREE_SLUG = 'free-shell';

    /** @var list<string> */
    public const THROWAWAY_EMAILS = ['share-check@gocast.test', 'dbl-check@gocast.test'];

    private Randomizer $rng;

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('e2e:seed is only available in local/testing environments.');

            return self::FAILURE;
        }

        // Fixtures, not sign-ups: keep the operator's Telegram quiet for the
        // users, stations and shows this creates (AdminTelegram is inert
        // without a token).
        config(['services.telegram.bot_token' => null]);

        // Same seed every run, so a rerun draws the same week of data.
        $this->rng = new Randomizer(new Mt19937(20261015));

        if ($this->option('clean-throwaway')) {
            foreach (self::THROWAWAY_EMAILS as $email) {
                $this->deleteAccount($email);
                $this->line("deleted:{$email}");
            }
        }

        foreach ([self::PRO_EMAIL, self::FREE_EMAIL, self::NEW_EMAIL, self::HELP_EMAIL, self::BLOG_EMAIL] as $email) {
            $this->deleteAccount($email);
        }

        try {
            $this->assertSlugsFree();
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->seedPro();
        $this->seedFree();
        $this->seedNew();
        $this->seedHelp();
        $this->seedBlog();

        return self::SUCCESS;
    }

    private function deleteAccount(string $email): void
    {
        $this->callSilently('e2e:auth', ['action' => 'delete', '--email' => $email]);
    }

    /**
     * A station someone else owns on one of our links would make the create
     * fail half-way; say so instead of deleting a station that isn't ours.
     */
    private function assertSlugsFree(): void
    {
        foreach ([self::PRO_SLUG, self::FREE_SLUG, self::HELP_SLUG, self::BLOG_SLUG] as $slug) {
            $station = Station::withTrashed()->where('slug', $slug)->first();
            if ($station !== null) {
                $owner = User::withTrashed()->whereKey($station->user_id)->value('email') ?? 'nobody';
                throw new RuntimeException("Station {$slug} already exists and belongs to {$owner}; delete it first.");
            }
        }
    }

    private function user(string $email, string $name, string $plan): User
    {
        return User::forceCreate([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make((string) $this->option('password')),
            'email_verified_at' => now(),
            'plan_id' => Plan::where('slug', $plan)->firstOrFail()->id,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function station(User $user, array $attributes): Station
    {
        /** @var Station $station */
        $station = $user->stations()->forceCreate([
            ...$attributes,
            'desired_state' => Station::STATE_STOPPED,
            'created_at' => now()->subDays(95),
        ]);

        return $station;
    }

    // ---------------------------------------------------------------- Pro

    private function seedPro(): void
    {
        $user = $this->user(self::PRO_EMAIL, 'Night Shift DJ', 'pro');

        $station = $this->station($user, [
            'name' => 'Night Shift Shell',
            'slug' => self::PRO_SLUG,
            'genre' => 'Electronic',
            'description' => 'Late-night electronic, ambient and lo-fi for the hours after midnight.',
            'timezone' => 'Europe/London',
            'social_links' => [
                ['label' => 'Instagram', 'url' => 'https://instagram.com/nightshiftshell'],
                ['label' => 'Mixcloud', 'url' => 'https://www.mixcloud.com/nightshiftshell/'],
                ['label' => null, 'url' => 'https://nightshiftshell.example.com'],
            ],
            'jingles_enabled' => true,
            'jingle_mode' => Station::JINGLE_MODE_TRACKS,
            'jingle_every_tracks' => 3,
        ]);

        $music = $this->proTracks($station);
        $jingles = $this->jingles($station);
        $playlists = $this->proPlaylists($station, $music);
        $slots = $this->proSlots($station, $playlists);
        $shows = $this->proShows($station);
        $listens = $this->listeners($station, 'pro', sessions: 360, days: 89);

        $this->line(sprintf(
            'seeded:%s pro station=%s tracks=%d jingles=%d playlists=%d slots=%d shows=%d listens=%d',
            self::PRO_EMAIL, $station->slug, count($music), count($jingles), count($playlists), $slots, $shows, $listens,
        ));
    }

    /** @return list<Track> */
    private function proTracks(Station $station): array
    {
        $rows = [
            ['Midnight Drive', 'Luma Kei', 241],
            ['Neon Rain', 'Harbor Lights', 318],
            ['Slow Orbit', 'Tessellate', 276],
            ['Glass City', 'Mira Vale', 202],
            ['After Hours (Extended Mix)', 'Dorian Park', 412],
            ['Low Tide', 'Coastal Static', 255],
            ['Quiet Engines', 'Night Ferry', 229],
            ['Paper Moons', 'Ana Sol', 187],
            ['Sodium Lamps', 'Grey Hours', 301],
            ['Hum of the Fridge', null, 164],
            ['ليل المدينة', 'نور', 233],
            ['Warehouse Hymn', 'Kestrel', 365],
            ['Velvet Static', 'The Long Wait', 214],
            ['Signal Lost', 'Ostrander', 268],
            ['Overpass', 'Junebug', 196],
            ['Four A.M. Tram', 'Lisbon Lowlights', 247],
            ['Cassette Dust', null, 178],
            ['Northern Line', 'Fold', 289],
            ['Sleepwalker', 'Mira Vale', 223],
            ['Afterglow', 'Harbor Lights', 260],
            ['Dial Tone Lullaby', 'Ana Sol', 205],
            ['Strobe Memory', 'Kestrel', 334],
            ['A Very Long Title For A Track That Somebody Exported Straight From Their DAW Without Renaming It At All (Final v3)', 'An Artist Name That Is Also Far Longer Than Anyone Would Reasonably Expect It To Be', 242],
            ['Warehouse Set — One Hour Live Techno Mix', 'Dorian Park', 3612],
        ];

        $tracks = [];
        foreach ($rows as $i => [$title, $artist, $duration]) {
            $tracks[] = $this->track($station, Track::KIND_MUSIC, $title, $artist, $duration, $i + 1);
        }

        return $tracks;
    }

    /** @return list<Track> */
    private function jingles(Station $station): array
    {
        $titles = ['Station ID — Night Shift', 'You’re listening to Night Shift', 'Late-night sweeper', 'Top of the hour ID', 'Short stinger'];

        $tracks = [];
        foreach ($titles as $i => $title) {
            $tracks[] = $this->track($station, Track::KIND_JINGLE, $title, null, $this->rng->getInt(3, 12), $i + 1);
        }

        return $tracks;
    }

    private function track(Station $station, string $kind, string $title, ?string $artist, int $duration, int $position): Track
    {
        /** @var Track $track */
        $track = $station->tracks()->forceCreate([
            'kind' => $kind,
            'path' => Str::ulid().'.mp3',
            'original_filename' => Str::slug(Str::limit($title, 60, '')).'.mp3',
            'title' => $title,
            'artist' => $artist,
            'duration_seconds' => $duration,
            // 192 kbps worth of bytes, so the size column looks like a file.
            'file_size_bytes' => $duration * 24_000,
            'position' => $position,
        ]);

        return $track;
    }

    /**
     * @param  list<Track>  $music
     * @return array<string, Playlist>
     */
    private function proPlaylists(Station $station, array $music): array
    {
        $attach = app(PlaylistTracks::class);
        $ids = array_map(fn (Track $t) => $t->getKey(), $music);

        // Every upload lands in the default playlist; the one exception is
        // "Hum of the Fridge", the track in no playlist at all.
        $orphan = $music[9]->getKey();
        $default = $station->defaultPlaylist()->firstOrFail();
        $attach->attach($default, array_values(array_filter($ids, fn ($id) => $id !== $orphan)));

        $make = function (string $name, string $order, int $position, array $trackIds) use ($station, $attach): Playlist {
            /** @var Playlist $playlist */
            $playlist = $station->playlists()->forceCreate([
                'name' => $name,
                'is_default' => false,
                'order' => $order,
                'position' => $position,
            ]);
            if ($trackIds !== []) {
                $attach->attach($playlist, $trackIds);
            }

            return $playlist;
        };

        return [
            'Main rotation' => $default,
            'Morning Soul' => $make('Morning Soul', Playlist::ORDER_SEQUENTIAL, 1, array_slice($ids, 6, 6)),
            'Lofi Afternoon' => $make('Lofi Afternoon', Playlist::ORDER_SHUFFLE, 2, array_slice($ids, 12, 7)),
            'Big Rotation' => $make('Big Rotation', Playlist::ORDER_SHUFFLE, 3, array_values(array_filter($ids, fn ($id) => $id !== $orphan && $id !== $ids[23]))),
            'One Track Wonder' => $make('One Track Wonder', Playlist::ORDER_SEQUENTIAL, 4, [$ids[23]]),
            'Empty Shelf' => $make('Empty Shelf', Playlist::ORDER_SEQUENTIAL, 5, []),
        ];
    }

    /**
     * The help screenshots open the Wednesday "Morning Soul" slot (no label,
     * so its title is the playlist's name) and tick Mon/Tue/Thu/Fri onto it,
     * then draw Drive time on Mon–Fri 16–19 and Fri 23:00–02:00. Nothing here
     * may sit in those windows or the drawn week would show overlaps.
     *
     * @param  array<string, Playlist>  $playlists
     */
    private function proSlots(Station $station, array $playlists): int
    {
        $slots = [
            [null, 'Morning Soul', [3], '06:00:00', '10:00:00', AutodjSlot::START_SOFT],
            ['Single Spin', 'One Track Wonder', [6], '10:00:00', '13:00:00', AutodjSlot::START_SOFT],
            ['Saturday Late', 'Big Rotation', [6], '22:00:00', '02:00:00', AutodjSlot::START_SOFT],
            ['Sunday Lunch', 'Empty Shelf', [0], '12:00:00', '14:00:00', AutodjSlot::START_SOFT],
            ['Sunday Wind-down', 'Lofi Afternoon', [0], '18:00:00', '20:00:00', AutodjSlot::START_HARD],
        ];

        foreach ($slots as $position => [$label, $playlist, $days, $start, $end, $mode]) {
            AutodjSlot::create([
                'station_id' => $station->id,
                'playlist_id' => $playlists[$playlist]->id,
                'label' => $label,
                'days' => $days,
                'start_time' => $start,
                'end_time' => $end,
                'start_mode' => $mode,
                'position' => $position,
            ]);
        }

        return count($slots);
    }

    /**
     * 24 past shows over ~60 days (more than the 20-row page of Your shows):
     * one over three hours, one under a minute, two from DJ software, and the
     * ones older than 30 days with no peak time.
     */
    private function proShows(Station $station): int
    {
        $count = 24;
        $rows = [];

        for ($i = 0; $i < $count; $i++) {
            $daysAgo = 1 + (int) round($i * 2.6);
            $start = CarbonImmutable::now()->subDays($daysAgo)->setTime(21, 0)->addMinutes($this->rng->getInt(0, 40));
            $minutes = match ($i) {
                2 => 200,       // the long one
                5 => 0,         // dropped after 40 seconds
                default => $this->rng->getInt(45, 150),
            };
            $end = $i === 5 ? $start->addSeconds(40) : $start->addMinutes($minutes);
            $external = in_array($i, [3, 11], true);
            $peak = $i === 5 ? 0 : $this->rng->getInt(2, 18);

            $rows[] = [
                'id' => (string) Str::uuid(),
                'station_id' => $station->id,
                'started_at' => $start,
                'ended_at' => $end,
                'peak_listeners' => $peak,
                'peak_at' => $daysAgo > 30 || $peak === 0 ? null : $start->addMinutes(intdiv(max(1, $minutes), 2)),
                'source_type' => $external ? 'external' : 'browser',
                'client' => match ($i) {
                    3 => 'BUTT 1.42.0',
                    11 => 'Mixxx 2.4.1',
                    default => null,
                },
                'ip_address' => '203.0.113.'.(10 + $i),
                'country' => 'GB',
                'created_at' => $start,
                'updated_at' => $end,
            ];
        }

        // A bulk insert, not create(): StreamSession::created is the
        // "broadcast started" alert, and these are history.
        DB::table('stream_sessions')->insert($rows);

        return $count;
    }

    // --------------------------------------------------------------- Free

    private function seedFree(): void
    {
        $user = $this->user(self::FREE_EMAIL, 'Free Keeper', 'free');

        $station = $this->station($user, [
            'name' => 'Free Shell',
            'slug' => self::FREE_SLUG,
            'genre' => 'Talk',
            'description' => 'Kitchen-table conversation, a couple of evenings a week.',
            'timezone' => 'America/New_York',
        ]);

        $listens = $this->listeners($station, 'fre', sessions: 14, days: 20);

        $this->line(sprintf(
            'seeded:%s free station=%s tracks=0 playlists=1 slots=0 shows=0 listens=%d',
            self::FREE_EMAIL, $station->slug, $listens,
        ));
    }

    // ---------------------------------------------------------------- New

    private function seedNew(): void
    {
        $this->user(self::NEW_EMAIL, 'Create Keeper', 'free');

        $this->line('seeded:'.self::NEW_EMAIL.' free no-station');
    }

    // --------------------------------------------------------------- Help

    private function seedHelp(): void
    {
        $user = $this->user(self::HELP_EMAIL, 'Sam Rivera', 'pro');

        $station = $this->station($user, [
            'name' => 'Night Shift Radio',
            'slug' => self::HELP_SLUG,
            'genre' => 'Electronic',
            'description' => 'Late-night electronic, ambient and lo-fi for the hours after midnight.',
            'timezone' => 'Europe/London',
            'artwork_url' => $this->helpArtwork(),
            'social_links' => [
                ['label' => 'Instagram', 'url' => 'https://instagram.com/nightshiftradio'],
                ['label' => 'Mixcloud', 'url' => 'https://www.mixcloud.com/nightshiftradio/'],
                ['label' => null, 'url' => 'https://nightshiftradio.example.com'],
            ],
            'jingles_enabled' => true,
            'jingle_mode' => Station::JINGLE_MODE_TRACKS,
            'jingle_every_tracks' => 3,
        ]);

        $rows = [
            // Main rotation: the late-night core.
            ['Midnight Drive', 'Luma Kei', 241], ['Neon Rain', 'Harbor Lights', 318], ['Slow Orbit', 'Tessellate', 276],
            ['Glass City', 'Mira Vale', 202], ['After Hours', 'Dorian Park', 412], ['Low Tide', 'Coastal Static', 255],
            ['Sodium Lamps', 'Grey Hours', 301], ['Warehouse Hymn', 'Kestrel', 365], ['Signal Lost', 'Ostrander', 268],
            ['Northern Line', 'Fold', 289], ['Afterglow', 'Harbor Lights', 260], ['Strobe Memory', 'Kestrel', 334],
            // Morning Soul.
            ['Sunday Best', 'The Marigolds', 214], ['Easy Light', 'Ada Moreno', 198], ['Coffee & Rain', 'June Okoro', 233],
            ['Open Window', 'The Marigolds', 247], ['Slow Bloom', 'Ada Moreno', 221], ['Golden Hour Walk', 'Eli Brandt', 256],
            // Lofi Afternoon.
            ['Paper Moons', 'Ana Sol', 187], ['Four A.M. Tram', 'Lisbon Lowlights', 247], ['Cassette Dust', 'Tape Weather', 178],
            ['Dial Tone Lullaby', 'Ana Sol', 205], ['Overpass', 'Junebug', 196], ['Rooftop Study', 'Tape Weather', 172],
            // Night Ambient.
            ['Quiet Engines', 'Night Ferry', 229], ['Velvet Static', 'The Long Wait', 414], ['Sleepwalker', 'Mira Vale', 323],
            ['Harbour Fog', 'Night Ferry', 388],
            // Weekend Mix.
            ['Friday Feeling', 'Dorian Park', 296], ['Lift Off', 'Kestrel', 312], ['Big Room Sunrise', 'Luma Kei', 345],
            ['Warehouse Set (Live, One Hour)', 'Dorian Park', 3612],
        ];
        $music = [];
        foreach ($rows as $i => [$title, $artist, $duration]) {
            $music[] = $this->track($station, Track::KIND_MUSIC, $title, $artist, $duration, $i + 1);
        }
        $jingles = $this->jingles($station);
        $ids = array_map(fn (Track $t) => $t->getKey(), $music);

        $attach = app(PlaylistTracks::class);
        $default = $station->defaultPlaylist()->firstOrFail();
        $attach->attach($default, array_slice($ids, 0, 12));
        $make = function (string $name, string $order, int $position, array $trackIds) use ($station, $attach): Playlist {
            /** @var Playlist $playlist */
            $playlist = $station->playlists()->forceCreate(['name' => $name, 'is_default' => false, 'order' => $order, 'position' => $position]);
            $attach->attach($playlist, $trackIds);

            return $playlist;
        };
        $playlists = [
            'Main rotation' => $default,
            'Morning Soul' => $make('Morning Soul', Playlist::ORDER_SEQUENTIAL, 1, array_slice($ids, 12, 6)),
            'Lofi Afternoon' => $make('Lofi Afternoon', Playlist::ORDER_SHUFFLE, 2, array_slice($ids, 18, 6)),
            'Night Ambient' => $make('Night Ambient', Playlist::ORDER_SHUFFLE, 3, array_slice($ids, 24, 4)),
            'Weekend Mix' => $make('Weekend Mix', Playlist::ORDER_SEQUENTIAL, 4, array_slice($ids, 28, 4)),
        ];

        // The help shots open the Wednesday "Morning Soul" slot (no label, so
        // its title is the playlist's name) and draw Mon–Fri 16–19 and
        // Fri 23:00–02:00 on screen: nothing below may sit in those windows.
        $slots = [
            [null, 'Morning Soul', [3], '06:00:00', '10:00:00', AutodjSlot::START_SOFT],
            ['Lunch', 'Lofi Afternoon', [1, 2, 3, 4, 5], '12:00:00', '14:00:00', AutodjSlot::START_SOFT],
            ['Saturday Night', 'Weekend Mix', [6], '20:00:00', '23:00:00', AutodjSlot::START_HARD],
            ['Sunday Ambient', 'Night Ambient', [0], '08:00:00', '11:00:00', AutodjSlot::START_SOFT],
        ];
        foreach ($slots as $position => [$label, $playlist, $days, $start, $end, $mode]) {
            AutodjSlot::create([
                'station_id' => $station->id, 'playlist_id' => $playlists[$playlist]->id, 'label' => $label,
                'days' => $days, 'start_time' => $start, 'end_time' => $end, 'start_mode' => $mode, 'position' => $position,
            ]);
        }

        $shows = $this->proShows($station);
        $listens = $this->listeners($station, 'hlp', sessions: 900, days: 89);

        $this->line(sprintf(
            'seeded:%s pro station=%s tracks=%d jingles=%d playlists=%d slots=%d shows=%d listens=%d',
            self::HELP_EMAIL, $station->slug, count($music), count($jingles), count($playlists), count($slots), $shows, $listens,
        ));
    }

    /**
     * The station the scheduling blog post's screenshots are taken from
     * (how-to-schedule-playlists-on-your-radio-station): the week its text
     * walks through — quiet breakfast, drive time, the news at six, last
     * week's podcast on Wednesday evening, late Friday and Saturday crossing
     * midnight, a weekend brunch.
     */
    private function seedBlog(): void
    {
        $user = $this->user(self::BLOG_EMAIL, 'Priya Shah', 'pro');

        $station = $this->station($user, [
            'name' => 'Riverside Radio',
            'slug' => self::BLOG_SLUG,
            'genre' => 'Community',
            'description' => 'Music, local news and the shows our neighbours make, all week long.',
            'timezone' => 'Europe/London',
        ]);

        $sets = [
            'Main rotation' => [
                ['Harbour Lights', 'The Wren Sisters', 224], ['Second Hand Sun', 'Okoro', 238], ['Little Victories', 'Mae Calloway', 201],
                ['Long Way Home', 'The Fieldnotes', 263], ['Paper Planes', 'Juno Hart', 192], ['River Song', 'The Wren Sisters', 247],
                ['Brighter Days', 'Okoro', 215], ['Corner Shop', 'Tom Ashby', 189],
            ],
            'Morning Coffee' => [
                ['Slow Morning', 'Ada Moreno', 212], ['Steam & Toast', 'June Okoro', 186], ['First Light', 'The Marigolds', 241],
                ['Kettle On', 'Eli Brandt', 177], ['Open Window', 'The Marigolds', 247],
            ],
            'Afternoon Drive' => [
                ['Green Light', 'Kestrel', 236], ['Overtake', 'Dorian Park', 259], ['Motorway Sunset', 'Luma Kei', 281],
                ['Rush Hour Hearts', 'Juno Hart', 204], ['Ring Road', 'The Fieldnotes', 228],
            ],
            'News Bulletin' => [
                ['Evening bulletin', 'Riverside Newsroom', 484], ['Headlines & weather', 'Riverside Newsroom', 362],
            ],
            'Podcasts' => [
                ['The Long Way Round, ep. 41: The last ferry', 'Riverside Radio', 2950],
                ['The Long Way Round, ep. 42: Market day', 'Riverside Radio', 3120],
            ],
            'Late Night' => [
                ['Quiet Engines', 'Night Ferry', 229], ['Velvet Static', 'The Long Wait', 414], ['Sodium Lamps', 'Grey Hours', 301],
                ['Harbour Fog', 'Night Ferry', 388],
            ],
            'Weekends' => [
                ['Saturday Kitchen', 'Tom Ashby', 233], ['Sunday Papers', 'Mae Calloway', 219], ['Picnic Weather', 'Okoro', 207],
                ['Lie-in', 'Ada Moreno', 248],
            ],
        ];

        $attach = app(PlaylistTracks::class);
        $default = $station->defaultPlaylist()->firstOrFail();
        $playlists = [];
        $position = 0;
        $trackNo = 0;
        foreach ($sets as $name => $tracks) {
            $ids = [];
            foreach ($tracks as [$title, $artist, $duration]) {
                $ids[] = $this->track($station, Track::KIND_MUSIC, $title, $artist, $duration, ++$trackNo)->getKey();
            }
            if ($name === 'Main rotation') {
                $playlist = $default;
            } else {
                /** @var Playlist $playlist */
                $playlist = $station->playlists()->forceCreate([
                    'name' => $name, 'is_default' => false, 'order' => Playlist::ORDER_SEQUENTIAL, 'position' => ++$position,
                ]);
            }
            $attach->attach($playlist, $ids);
            $playlists[$name] = $playlist;
        }

        $slots = [
            ['Breakfast', 'Morning Coffee', [1, 2, 3, 4, 5], '06:00:00', '10:00:00', AutodjSlot::START_SOFT],
            ['Drive time', 'Afternoon Drive', [1, 2, 3, 4, 5], '16:00:00', '18:00:00', AutodjSlot::START_SOFT],
            ['News at Six', 'News Bulletin', [1, 2, 3, 4, 5], '18:00:00', '18:30:00', AutodjSlot::START_HARD],
            ['Podcast replay', 'Podcasts', [3], '20:00:00', '21:00:00', AutodjSlot::START_HARD],
            ['After hours', 'Late Night', [5, 6], '23:00:00', '02:00:00', AutodjSlot::START_SOFT],
            ['Weekend brunch', 'Weekends', [0, 6], '10:00:00', '14:00:00', AutodjSlot::START_SOFT],
        ];
        foreach ($slots as $i => [$label, $playlist, $days, $start, $end, $mode]) {
            AutodjSlot::create([
                'station_id' => $station->id, 'playlist_id' => $playlists[$playlist]->id, 'label' => $label,
                'days' => $days, 'start_time' => $start, 'end_time' => $end, 'start_mode' => $mode, 'position' => $i,
            ]);
        }

        $this->line(sprintf(
            'seeded:%s pro station=%s tracks=%d playlists=%d slots=%d',
            self::BLOG_EMAIL, $station->slug, $trackNo, count($playlists), count($slots),
        ));
    }

    /**
     * The help station's artwork, on the public disk the way an upload lands
     * (UploadController), from the image the help shots always used.
     */
    private function helpArtwork(): ?string
    {
        $source = base_path('../client/tests/e2e/support/help-artwork.webp');
        if (! is_file($source)) {
            return null;
        }
        $path = 'uploads/images/e2e-night-shift-radio.webp';
        Storage::disk('public')->put($path, (string) file_get_contents($source));

        return asset("storage/{$path}");
    }

    // ---------------------------------------------------------- Listeners

    /**
     * Closed listener sessions spread over the window, busier recently, plus
     * the two rollups the audience page reads for listening time and
     * countries (listener_stats_hourly, listener_geo_daily) — normally
     * written by listeners:sweep and listeners:rollup.
     */
    private function listeners(Station $station, string $prefix, int $sessions, int $days): int
    {
        $countries = ['GB', 'GB', 'GB', 'GB', 'US', 'US', 'US', 'DE', 'NL', 'IE', 'FR', 'CA', 'AU', 'BR', 'JP'];
        $devices = ['mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'tablet'];
        $browsers = ['Chrome', 'Chrome', 'Safari', 'Safari', 'Firefox', 'Edge'];
        $referrers = [null, null, null, 'google.com', 'instagram.com', 'reddit.com', 'radio-browser.info'];
        $now = CarbonImmutable::now();

        $rows = [];
        for ($n = 0; $n < $sessions; $n++) {
            // A straight ramp, so recent days carry more of the audience
            // without a spike: squaring piled a tenth of it onto today.
            $daysAgo = (int) floor((1 - sqrt($this->rng->getFloat(0, 1))) * $days);
            $seconds = $this->rng->getInt(0, 9) === 0 ? $this->rng->getInt(5, 50) : $this->rng->getInt(90, 5400);
            $start = $now->subDays($daysAgo)->startOfDay()->addSeconds($this->rng->getInt(0, 86_399));
            if ($start->addSeconds($seconds)->greaterThan($now->subMinutes(5))) {
                $start = $now->subMinutes(5)->subSeconds($seconds + $this->rng->getInt(0, 3600));
            }
            $end = $start->addSeconds($seconds);
            $visitor = $this->rng->getInt(1, max(3, intdiv($sessions, 4)));

            $rows[] = [
                'id' => sprintf('e2e-%s-%014d', $prefix, $n),
                'station_id' => $station->id,
                'transport' => $this->rng->getInt(0, 3) === 0 ? 'icecast' : 'hls',
                'country' => $this->pick($countries),
                'device' => $this->pick($devices),
                'browser' => $this->pick($browsers),
                'referrer_host' => $this->pick($referrers),
                // Re-keyed per day, as ListenerAnalytics does.
                'visitor_hash' => hash('sha256', "{$prefix}-{$visitor}-".$start->toDateString()),
                'started_at' => $start,
                'last_seen_at' => $end,
                'ended_at' => $end,
                'seconds' => $seconds,
            ];
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('listener_sessions')->insert($chunk);
        }

        $this->rollups($station, $rows);

        return $sessions;
    }

    /** @param  list<array<string, mixed>>  $rows */
    private function rollups(Station $station, array $rows): void
    {
        $minimum = (int) config('analytics.min_listen_seconds', 60);
        $hours = [];
        $geo = [];

        foreach ($rows as $row) {
            /** @var CarbonImmutable $start */
            $start = $row['started_at'];
            $hour = $start->startOfHour()->toDateTimeString();
            $hours[$hour] ??= ['n' => 0, 'seconds' => 0, 'visitors' => [], 'qualified' => 0];
            $hours[$hour]['n']++;
            $hours[$hour]['seconds'] += $row['seconds'];
            $hours[$hour]['visitors'][$row['visitor_hash']] = true;
            $hours[$hour]['qualified'] += $row['seconds'] >= $minimum ? 1 : 0;

            $key = $start->toDateString().'|'.$row['country'];
            $geo[$key] ??= ['sessions' => 0, 'seconds' => 0];
            $geo[$key]['sessions']++;
            $geo[$key]['seconds'] += $row['seconds'];
        }

        $hourly = [];
        foreach ($hours as $hour => $h) {
            $hourly[] = [
                'station_id' => $station->id,
                'hour' => $hour,
                'peak_listeners' => max(1, (int) ceil($h['n'] * 0.75)),
                'listener_minutes' => (int) round($h['seconds'] / 60),
                'sampled_minutes' => 60,
                'sessions_started' => $h['n'],
                'unique_listeners' => count($h['visitors']),
                'qualified_listens' => $h['qualified'],
            ];
        }

        $daily = [];
        foreach ($geo as $key => $g) {
            [$day, $country] = explode('|', $key);
            $daily[] = [
                'station_id' => $station->id,
                'day' => $day,
                'country' => $country,
                'sessions' => $g['sessions'],
                'listener_seconds' => $g['seconds'],
            ];
        }

        foreach (array_chunk($hourly, 200) as $chunk) {
            DB::table('listener_stats_hourly')->insert($chunk);
        }
        foreach (array_chunk($daily, 200) as $chunk) {
            DB::table('listener_geo_daily')->insert($chunk);
        }
    }

    /**
     * @template T
     *
     * @param  list<T>  $items
     * @return T
     */
    private function pick(array $items): mixed
    {
        return $items[$this->rng->getInt(0, count($items) - 1)];
    }
}
