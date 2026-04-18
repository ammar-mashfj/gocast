<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An audio track uploaded to a station's library.
 *
 * @property string $id
 * @property string $station_id
 * @property string $title
 * @property string $artist
 * @property float $duration
 * @property string $file_path
 * @property int $file_size
 * @property string|null $mime_type
 * @property int $sort_order
 */
class Track extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'duration' => 'float',
            'file_size' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    /**
     * Resolve the absolute disk path for this track's audio file.
     */
    public function getFullPathAttribute(): string
    {
        return storage_path('app/private/tracks/'.$this->file_path);
    }
}
