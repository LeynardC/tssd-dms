<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RedirectIfAuthenticated
{
    /**
     * Same purpose as Laravel's stock version, but JSON-aware: our frontend
     * is a pure SPA that always sends Accept: application/json, so a plain
     * redirect() response is useless to it — the browser tries to follow
     * the redirect as a fetch, which then gets correctly blocked by CORS
     * since it's now a cross-origin GET with no matching route. Returning
     * a real JSON response instead means the frontend can react properly.
     */
    public function handle(Request $request, Closure $next, string ...$guards): Response
    {
        $guards = empty($guards) ? [null] : $guards;

        foreach ($guards as $guard) {
            if (Auth::guard($guard)->check()) {
                if ($request->expectsJson()) {
                    return response()->json([
                        'message' => 'Already authenticated.',
                        'code' => 'already_authenticated',
                    ], 409);
                }
                return redirect('/');
            }
        }

        return $next($request);
    }
}