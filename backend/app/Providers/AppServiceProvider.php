<?php

namespace App\Providers;

use App\Models\ActivityLog;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Baseline throttle for the whole /api surface. Fortify already
        // throttles login / two-factor / passkeys separately (see
        // FortifyServiceProvider); this covers everything else — search,
        // file downloads by id, the custom password-change route — which
        // was previously unlimited. Keyed per authenticated user, falling
        // back to IP for the rare unauthenticated /api hit.
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });

        // --- Sign-in audit trail ------------------------------------------
        // Every real Auth::login() (password, passkey, Google) fires Login;
        // session resumption does not, so this doesn't run per request. IP +
        // user agent are captured for security review. Failed / Lockout are
        // already rate-limited by Fortify (5/min per username+IP), so they
        // can't flood the log.
        Event::listen(function (Login $event) {
            $user = $event->user;
            ActivityLog::recordAuth(
                $user,
                'auth.login',
                $user->username ?? $user->email ?? (string) $user->getAuthIdentifier(),
                request()->ip(),
                request()->userAgent(),
                ['guard' => $event->guard],
            );
        });

        Event::listen(function (Logout $event) {
            if (! $event->user) {
                return;
            }
            ActivityLog::recordAuth(
                $event->user,
                'auth.logout',
                $event->user->username ?? $event->user->email ?? (string) $event->user->getAuthIdentifier(),
                request()->ip(),
                request()->userAgent(),
            );
        });

        Event::listen(function (Failed $event) {
            $identifier = $event->credentials['username']
                ?? $event->credentials['email']
                ?? 'unknown';
            ActivityLog::recordAuth(
                null,
                'auth.failed',
                (string) $identifier,
                request()->ip(),
                request()->userAgent(),
            );
        });

        Event::listen(function (Lockout $event) {
            ActivityLog::recordAuth(
                null,
                'auth.lockout',
                (string) ($event->request->input('username') ?? 'unknown'),
                $event->request->ip(),
                $event->request->userAgent(),
            );
        });
    }
}
