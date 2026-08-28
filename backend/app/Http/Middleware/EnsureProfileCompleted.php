<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureProfileCompleted
{
    protected array $exempt = [
        'login',
        'logout',
        'sanctum/csrf-cookie',
        'api/password/change',
        'api/profile/complete',
        'api/user',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Chief has no program/unit/position to declare — profile_completed
        // is seeded true for her account, so this never triggers.
        if (!$user || $user->must_change_password || $user->profile_completed) {
            return $next($request);
        }

        foreach ($this->exempt as $path) {
            if ($request->is($path)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'Profile completion required before continuing.',
            'code' => 'profile_incomplete',
        ], 428);
    }
}