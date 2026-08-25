<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    public $timestamps = false;

    protected $table = 'activity_log';

    protected $fillable = [
        'actor_id',
        'actor_name',
        'action',
        'subject_type',
        'subject_id',
        'subject_label',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (ActivityLog $log) {
            $log->created_at = $log->created_at ?? now();
        });
    }

    public static function record(
        \App\Models\User $actor,
        string $action,
        string $subjectType,
        ?int $subjectId,
        ?string $subjectLabel,
        array $metadata = []
    ): self {
        return static::create([
            'actor_id' => $actor->id,
            'actor_name' => $actor->name,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'subject_label' => $subjectLabel,
            'metadata' => $metadata,
        ]);
    }
}
