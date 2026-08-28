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

    /**
     * Sign-in / sign-out events. $user is null for a failed attempt or a
     * lockout — actor_name then holds the identifier that was tried, capped
     * so an oversized login field can't break the insert. IP and user agent
     * go in metadata for security review.
     */
    public static function recordAuth(
        ?\App\Models\User $user,
        string $action,
        string $identifier,
        ?string $ip,
        ?string $userAgent,
        array $extra = []
    ): self {
        return static::create([
            'actor_id' => $user?->id,
            'actor_name' => $user?->name ?? \Illuminate\Support\Str::limit($identifier, 200, ''),
            'action' => $action,
            'subject_type' => 'Auth',
            'subject_id' => $user?->id,
            'subject_label' => \Illuminate\Support\Str::limit($identifier, 200, ''),
            'metadata' => ['ip' => $ip, 'user_agent' => \Illuminate\Support\Str::limit((string) $userAgent, 500, '')] + $extra,
        ]);
    }
}
