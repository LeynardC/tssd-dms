<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Folder extends Model
{
    protected $fillable = ['program_id', 'name', 'parent_id', 'created_by', 'retired', 'retired_at', 'retired_by'];

    // Controls what gets WRITTEN to the database for datetime attributes —
    // the 'datetime:format' cast below only controls parsing/display, not
    // the save format, so without this override every retired_at still gets
    // truncated to whole-second precision on the way to the database
    // regardless of the column's own precision. That's exactly what let two
    // back-to-back retire() calls collide (see the
    // widen_folder_retired_at_precision migration).
    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'retired' => 'boolean',
            'retired_at' => 'datetime:Y-m-d H:i:s.u',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Folder::class, 'parent_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function retiredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'retired_by');
    }
}
