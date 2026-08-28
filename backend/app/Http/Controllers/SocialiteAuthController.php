<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\OAuthAccountLink;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;

class SocialiteAuthController extends Controller
{
    // Belt-and-suspenders alongside the route's ->whereIn() constraint — no
    // arbitrary string should ever reach Socialite::driver().
    private const ALLOWED_PROVIDERS = ['google'];

    private function frontendUrl(): string
    {
        return rtrim(env('FRONTEND_URL', 'http://localhost:5173'), '/');
    }

    // Redirect back to the SPA with a short, stable error *code* rather than a
    // full sentence. The SPA maps it to display text (oauthLinkService.ts).
    // Keeps human-readable copy out of browser history and web-server logs,
    // and keeps the wording in one place on the frontend.
    private function bounce(string $path, string $code): RedirectResponse
    {
        return redirect($this->frontendUrl() . $path . '?oauth_error=' . urlencode($code));
    }

    public function redirect(string $provider): RedirectResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        // Whether this round-trip is "link this Google account to my
        // already-logged-in staff account" or "log me in with an
        // already-approved Google account" depends entirely on whether the
        // browser is currently authenticated right now, before it ever
        // leaves for Google.
        session(['oauth_intent' => Auth::check() ? 'link' : 'login']);

        return Socialite::driver($provider)->redirect();
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        $intent = $request->session()->pull('oauth_intent', 'login');

        try {
            $socialiteUser = Socialite::driver($provider)->user();
        } catch (\Throwable) {
            return $this->bounce($intent === 'link' ? '/settings' : '/login', 'google_failed');
        }

        return $intent === 'link'
            ? $this->handleLink($request, $provider, $socialiteUser)
            : $this->handleLogin($request, $provider, $socialiteUser);
    }

    // A staff member, already logged in, asking to attach a Google account
    // to their own account — this never creates a new user, only a pending
    // request against the one they're already signed into.
    private function handleLink(Request $request, string $provider, SocialiteUser $socialiteUser): RedirectResponse
    {
        if (!Auth::check()) {
            return $this->bounce('/login', 'link_session_expired');
        }

        $user = Auth::user();

        $existing = OAuthAccountLink::where('provider', $provider)
            ->where('provider_user_id', $socialiteUser->getId())
            ->whereIn('status', ['pending', 'approved'])
            ->first();

        if ($existing) {
            return $this->bounce(
                '/settings',
                $existing->user_id === $user->id ? 'link_already_requested' : 'link_taken',
            );
        }

        // One active (pending or approved) link per provider per user — the
        // Settings UI only ever displays one at a time, so allowing a second
        // to silently exist would make the first invisible/unmanageable.
        $alreadyHasOne = OAuthAccountLink::where('user_id', $user->id)
            ->where('provider', $provider)
            ->whereIn('status', ['pending', 'approved'])
            ->exists();

        if ($alreadyHasOne) {
            return $this->bounce('/settings', 'link_has_one');
        }

        $link = OAuthAccountLink::create([
            'user_id' => $user->id,
            'provider' => $provider,
            'provider_user_id' => $socialiteUser->getId(),
            'provider_email' => $socialiteUser->getEmail(),
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        ActivityLog::record(
            actor: $user,
            action: 'oauth_link.requested',
            subjectType: 'Staff',
            subjectId: $user->id,
            subjectLabel: $user->name,
            metadata: ['provider' => $provider, 'provider_email' => $link->provider_email],
        );

        return redirect($this->frontendUrl() . '/settings?oauth_link=pending');
    }

    // Someone not currently logged in, trying to sign in with Google — the
    // only way this succeeds is an approved link already sitting in the
    // table. There is no path here that creates an account.
    private function handleLogin(Request $request, string $provider, SocialiteUser $socialiteUser): RedirectResponse
    {
        $link = OAuthAccountLink::where('provider', $provider)
            ->where('provider_user_id', $socialiteUser->getId())
            ->where('status', 'approved')
            ->first();

        if (!$link) {
            return $this->bounce('/login', 'login_not_linked');
        }

        $user = $link->user;

        if (!$user || !$user->is_active) {
            return $this->bounce('/login', 'login_deactivated');
        }

        // Google sign-in does not run the TOTP challenge. For an account that
        // has two-step verification enabled — every Chief account, plus any
        // staff who opted in — letting Google in would silently drop the
        // second factor and reduce the account's security to whatever its
        // Google account has. Those accounts must use the password + TOTP
        // path, where the challenge is actually enforced. (Passkey login is
        // exempt from this: a passkey is itself a strong second factor.)
        if ($user->two_factor_confirmed_at !== null) {
            return $this->bounce('/login', 'login_2fa_enabled');
        }

        // Same session-based login Fortify itself establishes for
        // password sign-in — Sanctum's stateful-request handling picks it
        // up for subsequent API calls the same way either path works.
        Auth::login($user);
        $request->session()->regenerate();

        return redirect($this->frontendUrl() . '/monitoring');
    }
}
