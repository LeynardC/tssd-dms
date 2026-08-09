<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordChanged
{
    /**
     * Routes exempt from this gate — the password-change endpoint itself,
     * plus login/logout, must stay reachable or the user can never actually
     * satisfy the condition this middleware is enforcing.
     */
    protected array $exempt = [
    'login',
    'logout',
    'sanctum/csrf-cookie',
    'api/password/change',
    'api/user',
];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user || !$user->must_change_password) {
            return $next($request);
        }

        foreach ($this->exempt as $path) {
            if ($request->is($path)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'Password change required before continuing.',
            'code' => 'must_change_password',
        ], 428);
    }
}