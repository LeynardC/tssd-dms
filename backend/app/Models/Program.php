<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Program extends Model
{
    protected $table = 'programs';

    protected $fillable = [
        'code', 'name', 'unit', 'created_by', 'retired', 'retired_at', 'retired_by',
        'founded_at', 'vision', 'mission', 'scope',
    ];

    protected function casts(): array
    {
        return ['retired' => 'boolean', 'retired_at' => 'datetime', 'founded_at' => 'date'];
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
