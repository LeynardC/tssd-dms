<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class File extends Model
{
    protected $table = 'files';

    protected $fillable = [
        'program_id',
        'folder_id',
        'original_name',
        'stored_path',
        'mime_type',
        'size_bytes',
        'uploaded_by',
        'description',
        'locked',
        'parsed_data',
    ];

    protected function casts(): array
    {
        return [
            'locked' => 'boolean',
            'parsed_data' => 'array',
        ];
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'folder_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
