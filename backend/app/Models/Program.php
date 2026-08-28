<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Program extends Model
{
    protected $table = 'programs';

    protected $fillable = [
        'code', 'name', 'unit', 'created_by', 'retired',
        'founded_at', 'vision', 'mission', 'scope',
    ];

    protected function casts(): array
    {
        return ['retired' => 'boolean', 'founded_at' => 'date'];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
